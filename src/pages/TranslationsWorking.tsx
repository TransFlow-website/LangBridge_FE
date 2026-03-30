import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Table, type TableColumn } from "../components/Table";
import {
	type DocumentListItem,
	Priority,
	type DocumentSortOption,
} from "../types/document";
import type { DocumentState } from "../types/translation";
import { colors } from "../constants/designTokens";
import { Button } from "../components/Button";
import {
	documentApi,
	type DocumentResponse,
	type DocumentVersionResponse,
} from "../services/documentApi";
import { categoryApi } from "../services/categoryApi";
import { useUser } from "../contexts/UserContext";
import type { LockStatusResponse } from "../services/translationWorkApi";
import { formatLastModifiedDate } from "../utils/dateUtils";
import { formatTranslationListVersionLabel } from "../utils/versionDisplay";
import { StatusBadge } from "../components/StatusBadge";

/** 내가 시작한 복사본 중, 목록에 보여 줄 상태 (번역 중 ~ 게시까지) */
const MY_ASSIGNMENT_STATUSES = new Set<string>([
	"IN_TRANSLATION",
	"PENDING_REVIEW",
	"APPROVED",
	"PUBLISHED",
]);

function countParagraphs(html: string): number {
	if (!html || html.trim().length === 0) return 0;
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, "text/html");
		const body = doc.body;
		const indexedParagraphs = body.querySelectorAll("[data-paragraph-index]");
		if (indexedParagraphs.length > 0) {
			let maxIndex = -1;
			indexedParagraphs.forEach((el) => {
				const indexStr = (el as HTMLElement).getAttribute(
					"data-paragraph-index",
				);
				if (indexStr) {
					const index = Number.parseInt(indexStr, 10);
					if (!isNaN(index) && index > maxIndex) maxIndex = index;
				}
			});
			return maxIndex + 1;
		}
		const paragraphSelectors =
			"p, h1, h2, h3, h4, h5, h6, div, li, blockquote, article, section, figure, figcaption";
		const elements = body.querySelectorAll(paragraphSelectors);
		let count = 0;
		elements.forEach((el) => {
			const text = el.textContent?.trim();
			const hasImages = el.querySelectorAll("img").length > 0;
			if ((text && text.length > 0) || hasImages) count++;
		});
		return count;
	} catch {
		return 0;
	}
}

// DocumentResponse를 DocumentListItem으로 변환 (락/버전 정보 포함)
const convertToDocumentListItem = (
	doc: DocumentResponse,
	categoryMap: Map<number, string>,
	lockStatus: LockStatusResponse | null,
	originalVersion: DocumentVersionResponse | null,
	currentVersionNumber: number | null,
	userFacingVersionNumber: number | null,
): DocumentListItem => {
	let progress = 0;
	if (doc.status === "APPROVED" || doc.status === "PUBLISHED") {
		progress = 100;
	} else if (doc.status === "PENDING_REVIEW") {
		progress = 100;
	} else if (doc.status === "IN_TRANSLATION" && originalVersion?.content) {
		const totalParagraphs = countParagraphs(originalVersion.content);
		if (totalParagraphs > 0) {
			const completedCount = lockStatus?.completedParagraphs?.length || 0;
			progress = Math.round((completedCount / totalParagraphs) * 100);
		}
	}
	const category =
		doc.categoryId && categoryMap
			? categoryMap.get(doc.categoryId) || `카테고리 ${doc.categoryId}`
			: doc.categoryId
				? `카테고리 ${doc.categoryId}`
				: "미분류";

	const item: DocumentListItem = {
		id: doc.id,
		title: doc.title,
		category,
		categoryId: doc.categoryId,
		estimatedLength: doc.estimatedLength,
		progress,
		deadline: undefined,
		priority: Priority.MEDIUM,
		status: doc.status as DocumentState,
		lastModified: doc.updatedAt
			? formatLastModifiedDate(doc.updatedAt)
			: undefined,
		assignedManager: doc.lastModifiedBy?.name,
		isFinal: !!(doc as DocumentResponse).currentVersionIsFinal,
		originalUrl: doc.originalUrl,
		currentWorker: doc.createdBy?.name ?? lockStatus?.lockedBy?.name,
		currentVersionNumber: currentVersionNumber ?? undefined,
		userFacingVersionNumber: userFacingVersionNumber ?? undefined,
		isMyLock: true,
	};
	return item;
};

export default function TranslationsWorking() {
	const navigate = useNavigate();
	const { user } = useUser();
	const [documents, setDocuments] = useState<DocumentListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedCategory, setSelectedCategory] = useState<string>("전체");
	const [categories, setCategories] = useState<string[]>(["전체"]);
	const [sortOption, setSortOption] = useState<DocumentSortOption>({
		field: "lastModified",
		order: "desc",
	});

	// 카테고리 목록 (번역 대기 문서 페이지와 동일하게 API에서 로드)
	useEffect(() => {
		const loadCategories = async () => {
			try {
				const categoryList = await categoryApi.getAllCategories();
				setCategories(["전체", ...categoryList.map((cat) => cat.name)]);
			} catch (e) {
				console.error("카테고리 목록 로드 실패:", e);
			}
		};
		loadCategories();
	}, []);

	// API에서 문서 목록 가져오기
	useEffect(() => {
		const fetchDocuments = async () => {
			if (!user?.id) {
				setLoading(false);
				setError("로그인이 필요합니다.");
				return;
			}
			try {
				setLoading(true);
				setError(null);
				console.log("📋 내가 작업 중인 문서 조회 시작...");

				const [categoryList, allDocuments] = await Promise.all([
					categoryApi.getAllCategories(),
					documentApi.getAllDocuments(),
				]);
				const map = new Map<number, string>();
				categoryList.forEach((cat) => map.set(cat.id, cat.name));

				const myId = user?.id;
				// 복사본의 createdBy가 나인 문서만 — 번역 중·검토 대기·승인·게시까지 포함
				const myWorkingDocs =
					myId != null
						? allDocuments.filter(
								(doc) =>
									MY_ASSIGNMENT_STATUSES.has(doc.status) &&
									Number(doc.createdBy?.id) === Number(myId),
							)
						: [];

				const docsWithVersion = await Promise.all(
					myWorkingDocs.map(async (doc) => {
						let originalVersion: DocumentVersionResponse | null = null;
						let currentVersionNumber: number | null = null;
						let userFacingVersionNumber: number | null =
							doc.userFacingVersionNumber ?? null;
						try {
							const versions = await documentApi.getDocumentVersions(doc.id);
							originalVersion =
								versions.find((v) => v.versionType === "ORIGINAL") || null;
							if (doc.currentVersionId) {
								const currentVer = versions.find(
									(v) => v.id === doc.currentVersionId,
								);
								currentVersionNumber = currentVer?.versionNumber ?? null;
								if (currentVer) {
									userFacingVersionNumber =
										currentVer.versionType === "ORIGINAL"
											? 1
											: currentVer.versionNumber;
								}
							}
						} catch (_) {}
						const lockStatus: LockStatusResponse = {
							locked: false,
							canEdit: true,
							completedParagraphs: doc.completedParagraphs ?? [],
						};
						return {
							doc,
							lockStatus,
							originalVersion,
							currentVersionNumber,
							userFacingVersionNumber,
						};
					}),
				);

				const converted = docsWithVersion.map(
					({
						doc,
						lockStatus,
						originalVersion,
						currentVersionNumber,
						userFacingVersionNumber,
					}) =>
						convertToDocumentListItem(
							doc,
							map,
							lockStatus,
							originalVersion,
							currentVersionNumber,
							userFacingVersionNumber,
						),
				);
				setDocuments(converted);
			} catch (err) {
				console.error("❌ 문서 목록 조회 실패:", err);
				setError(
					err instanceof Error
						? err.message
						: "문서 목록을 불러오는데 실패했습니다.",
				);
				setDocuments([]);
			} finally {
				setLoading(false);
			}
		};

		if (user) {
			fetchDocuments();
		} else {
			setLoading(false);
			setError("로그인이 필요합니다.");
		}
	}, [user]);

	// 필터링 및 정렬 (lastModified는 YYYY-MM-DD HH:mm 문자열로 정렬 가능)
	const filteredAndSortedDocuments = useMemo(() => {
		let filtered = [...documents];

		// 카테고리 필터
		if (selectedCategory !== "전체") {
			filtered = filtered.filter((doc) => doc.category === selectedCategory);
		}

		// 정렬
		filtered.sort((a, b) => {
			if (sortOption.field === "lastModified") {
				const aTime = a.lastModified || "";
				const bTime = b.lastModified || "";
				return sortOption.order === "asc"
					? aTime.localeCompare(bTime)
					: bTime.localeCompare(aTime);
			} else if (sortOption.field === "title") {
				return sortOption.order === "asc"
					? a.title.localeCompare(b.title)
					: b.title.localeCompare(a.title);
			}
			return 0;
		});

		return filtered;
	}, [documents, selectedCategory, sortOption]);

	const handleContinueTranslation = (doc: DocumentListItem) => {
		navigate(`/translations/${doc.id}/work`, {
			state: { from: "/translations/working" },
		});
	};

	const handleViewDetail = (doc: DocumentListItem) => {
		navigate(`/documents/${doc.id}?from=working`);
	};

	const columns: TableColumn<DocumentListItem>[] = [
		{
			key: "title",
			label: "문서 제목",
			width: "minmax(0, 3fr)",
			render: (item) => (
				<span
					style={{
						fontWeight: 500,
						color: "#000000",
						minWidth: 0,
						whiteSpace: "normal",
						overflow: "visible",
						display: "block",
						lineHeight: 1.2,
						wordBreak: "break-word",
					}}
					title={item.title}
				>
					{item.title}
				</span>
			),
		},
		{
			key: "status",
			label: "상태",
			width: "minmax(0, 0.8fr)",
			render: (item) => <StatusBadge status={item.status} />,
		},
		{
			key: "category",
			label: "카테고리",
			width: "minmax(0, 0.7fr)",
			render: (item) => (
				<span style={{ color: colors.primaryText, fontSize: "12px" }}>
					{item.category ?? "-"}
				</span>
			),
		},
		{
			key: "lastModified",
			label: "최근 수정",
			width: "minmax(0, 0.9fr)",
			align: "right",
			render: (item) => (
				<span style={{ color: colors.primaryText, fontSize: "12px" }}>
					{item.lastModified || "-"}
				</span>
			),
		},
		{
			key: "currentWorker",
			label: "작업자",
			width: "minmax(0, 0.7fr)",
			render: (item) => (
				<span style={{ color: colors.primaryText, fontSize: "12px" }}>
					{item.currentWorker || "-"}
				</span>
			),
		},
		{
			key: "currentVersion",
			label: "현재 버전",
			width: "minmax(0, 0.5fr)",
			align: "right",
			render: (item) => (
				<span style={{ color: colors.primaryText, fontSize: "12px" }}>
					{formatTranslationListVersionLabel(
						item.isFinal,
						item.currentVersionNumber ?? null,
						item.userFacingVersionNumber,
					)}
				</span>
			),
		},
		{
			key: "estimatedLength",
			label: "예상 분량",
			width: "minmax(0, 0.7fr)",
			align: "right",
			render: (item) => (
				<span style={{ color: colors.primaryText, fontSize: "12px" }}>
					{item.estimatedLength
						? `${item.estimatedLength.toLocaleString()}자`
						: "-"}
				</span>
			),
		},
		{
			key: "action",
			label: "액션",
			width: "260px",
			align: "right",
			render: (item) => {
				const doneOrPublished =
					item.status === "APPROVED" || item.status === "PUBLISHED";
				return (
					<div
						style={{
							display: "flex",
							gap: "6px",
							justifyContent: "flex-end",
							flexWrap: "nowrap",
						}}
					>
						<Button
							variant="secondary"
							onClick={(e) => {
								if (e) e.stopPropagation();
								handleViewDetail(item);
							}}
							style={{ fontSize: "12px", padding: "6px 12px" }}
						>
							상세보기
						</Button>
						<Button
							variant="primary"
							onClick={(e) => {
								if (e) e.stopPropagation();
								handleContinueTranslation(item);
							}}
							style={{ fontSize: "12px", padding: "6px 12px" }}
						>
							{doneOrPublished ? "보기" : "새로 번역하기"}
						</Button>
					</div>
				);
			},
		},
	];

	return (
		<div
			style={{
				padding: "24px",
				backgroundColor: colors.primaryBackground,
				minHeight: "100vh",
			}}
		>
			<div
				style={{
					maxWidth: "1400px",
					margin: "0 auto",
				}}
			>
				<h1
					style={{
						fontSize: "20px",
						fontWeight: 600,
						color: "#000000",
						marginBottom: "8px",
					}}
				>
					내가 작업 중인 문서
				</h1>
				<p
					style={{
						fontSize: "13px",
						color: colors.secondaryText,
						marginBottom: "24px",
					}}
				>
					번역 중·검토 대기·승인 완료·게시까지, 내가 시작한 문서가 여기에
					표시됩니다.
				</p>

				{/* 필터/정렬 바 */}
				<div
					style={{
						backgroundColor: colors.surface,
						border: `1px solid ${colors.border}`,
						borderRadius: "8px",
						padding: "16px",
						marginBottom: "16px",
						display: "flex",
						gap: "12px",
						alignItems: "center",
						flexWrap: "wrap",
					}}
				>
					<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
						<label style={{ fontSize: "13px", color: colors.primaryText }}>
							카테고리:
						</label>
						<select
							value={selectedCategory}
							onChange={(e) => setSelectedCategory(e.target.value)}
							style={{
								padding: "6px 12px",
								border: `1px solid ${colors.border}`,
								borderRadius: "4px",
								fontSize: "13px",
								backgroundColor: colors.surface,
								color: "#000000",
								cursor: "pointer",
							}}
						>
							{categories.map((cat) => (
								<option key={cat} value={cat}>
									{cat}
								</option>
							))}
						</select>
					</div>

					<div
						style={{
							marginLeft: "auto",
							display: "flex",
							gap: "8px",
							alignItems: "center",
						}}
					>
						<label style={{ fontSize: "13px", color: colors.primaryText }}>
							정렬:
						</label>
						<select
							value={`${sortOption.field}-${sortOption.order}`}
							onChange={(e) => {
								const [field, order] = e.target.value.split("-");
								setSortOption({
									field: field as any,
									order: order as "asc" | "desc",
								});
							}}
							style={{
								padding: "6px 12px",
								border: `1px solid ${colors.border}`,
								borderRadius: "4px",
								fontSize: "13px",
								backgroundColor: colors.surface,
								color: "#000000",
								cursor: "pointer",
							}}
						>
							<option value="lastModified-desc">최근 수정순</option>
							<option value="lastModified-asc">오래된 수정순</option>
							<option value="title-asc">제목 가나다순</option>
						</select>
					</div>
				</div>

				{/* 에러 메시지 */}
				{error && (
					<div
						style={{
							padding: "16px",
							marginBottom: "16px",
							backgroundColor: "#F5F5F5",
							border: `1px solid ${colors.border}`,
							borderRadius: "8px",
							color: colors.primaryText,
							fontSize: "13px",
						}}
					>
						⚠️ {error}
					</div>
				)}

				{/* 테이블 */}
				{loading ? (
					<div
						style={{
							padding: "48px",
							textAlign: "center",
							color: colors.primaryText,
							fontSize: "13px",
						}}
					>
						로딩 중...
					</div>
				) : (
					<Table
						columns={columns}
						data={filteredAndSortedDocuments}
						onRowClick={(item) => {
							// 행 클릭 시 번역 작업 화면으로 이동
							handleContinueTranslation(item);
						}}
						emptyMessage="표시할 문서가 없습니다. 번역 문서 목록에서 번역을 시작하거나, 다른 계정으로 만든 문서는 여기에 나오지 않습니다."
					/>
				)}
			</div>
		</div>
	);
}
