import type React from "react";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Table, type TableColumn } from "../components/Table";
import { StatusBadge } from "../components/StatusBadge";
import {
	type DocumentListItem,
	Priority,
	DocumentFilter,
	type DocumentSortOption,
} from "../types/document";
import { DocumentState } from "../types/translation";
import { colors } from "../constants/designTokens";
import { Button } from "../components/Button";
import { documentApi, type DocumentResponse } from "../services/documentApi";
import { categoryApi, type CategoryResponse } from "../services/categoryApi";
import { useUser } from "../contexts/UserContext";
import { UserRole } from "../types/user";
import { Modal } from "../components/Modal";
import { translationWorkApi } from "../services/translationWorkApi";
import {
	formatLastModifiedDate,
	formatLastModifiedDateDisplay,
} from "../utils/dateUtils";
import { useMyInTranslationBySourceId } from "../hooks/useMyInTranslationBySourceId";

function isLockOld(lockedAt?: string): boolean {
	if (!lockedAt) return false;
	return Date.now() - new Date(lockedAt).getTime() > 24 * 60 * 60 * 1000;
}

const categories = ["전체", "웹사이트", "마케팅", "고객지원", "기술문서"];
const statuses = [
	"전체",
	"임시저장",
	"번역 대기",
	"번역 중",
	"검토 중",
	"승인 완료",
	"게시 완료",
];

const statusChipStyles: Record<
	string,
	{ bg: string; text: string; border: string }
> = {
	임시저장: { bg: "#E5E7EB", text: "#4B5563", border: "#9CA3AF" },
	"번역 대기": { bg: "#DBEAFE", text: "#1D4ED8", border: "#60A5FA" },
	"번역 중": { bg: "#FFEDD5", text: "#C2410C", border: "#FDBA74" },
	"검토 중": { bg: "#EDE9FE", text: "#5B21B6", border: "#C4B5FD" },
	"승인 완료": { bg: "#D1FAE5", text: "#047857", border: "#6EE7B7" },
	"게시 완료": { bg: "#CCFBF1", text: "#0F766E", border: "#5EEAD4" },
};

function getSourceLabel(originalUrl?: string): string | null {
	if (!originalUrl) return null;
	try {
		const host = new URL(originalUrl).hostname
			.toLowerCase()
			.replace(/^www\./, "");
		if (host === "crev.info") return "CREV";
		if (host === "icr.org") return "ICR";
		if (host === "creation.com") return "CREATION";
		if (host === "ancientpatriarchs.wordpress.com") return "ANCIENTPATRIARCHS";
		return "기타";
	} catch {
		return "기타";
	}
}

function compareByCreatedAtThenId(
	a: DocumentListItem,
	b: DocumentListItem,
): number {
	const ac = a.createdAt || "";
	const bc = b.createdAt || "";
	const t = ac.localeCompare(bc);
	if (t !== 0) return t;
	return Number(a.id) - Number(b.id);
}

// DocumentResponse를 DocumentListItem으로 변환
const convertToDocumentListItem = (
	doc: DocumentResponse,
	categoryMap?: Map<number, string>,
): DocumentListItem => {
	// 진행률 계산 (임시로 0%, 나중에 버전 정보에서 계산)
	const progress = 0;

	// 마감일 계산 (임시로 createdAt 기준으로 계산, 나중에 deadline 필드 추가 필요)
	const createdAt = new Date(doc.createdAt);
	const now = new Date();
	const diffDays = Math.ceil(
		(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000 - now.getTime()) /
			(1000 * 60 * 60 * 24),
	);
	const deadline = diffDays > 0 ? `${diffDays}일 후` : "마감됨";

	// 우선순위 (임시로 기본값, 나중에 priority 필드 추가 필요)
	const priority = Priority.MEDIUM;

	// 카테고리 이름 (카테고리 맵에서 조회, 없으면 미분류)
	const category = doc.categoryId
		? (categoryMap?.get(doc.categoryId) ?? "미분류")
		: "미분류";

	const item: DocumentListItem = {
		id: doc.id,
		title: doc.title,
		category,
		categoryId: doc.categoryId,
		estimatedLength: doc.estimatedLength,
		progress,
		deadline,
		priority,
		status: doc.status as DocumentState,
		createdAt: doc.createdAt,
		lastModified: doc.updatedAt
			? formatLastModifiedDate(doc.updatedAt)
			: undefined,
		assignedManager: doc.createdBy?.name,
		isFinal: doc.currentVersionIsFinal === true,
		originalUrl: doc.originalUrl,
		hasVersions: doc.hasVersions === true,
		sourceDocumentId: doc.sourceDocumentId ?? null,
	};
	if (doc.createdBy?.name) item.currentWorker = doc.createdBy.name;
	if (doc.currentVersionId != null)
		item.currentVersionId = doc.currentVersionId;
	if (doc.currentVersionNumber != null)
		item.currentVersionNumber = doc.currentVersionNumber;
	return item;
};

// 검색 결과 하이라이트 컴포넌트
const HighlightText: React.FC<{ text: string; searchTerm: string }> = ({
	text,
	searchTerm,
}) => {
	if (!searchTerm) return <>{text}</>;

	const regex = new RegExp(`(${searchTerm})`, "gi");
	const parts = text.split(regex);

	return (
		<>
			{parts.map((part, index) =>
				regex.test(part) ? (
					<mark
						key={index}
						style={{ backgroundColor: "#ffeb3b", padding: "0 2px" }}
					>
						{part}
					</mark>
				) : (
					part
				),
			)}
		</>
	);
};

export default function Documents() {
	const navigate = useNavigate();
	const { user } = useUser();
	const [documents, setDocuments] = useState<DocumentListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedCategory, setSelectedCategory] = useState<string>("전체");
	const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
	const [selectedSourceLabel, setSelectedSourceLabel] =
		useState<string>("전체");
	const [selectedManager, setSelectedManager] = useState<string>("전체");
	const [selectedPriority, setSelectedPriority] = useState<string>("전체");
	const [selectedAuthor, setSelectedAuthor] = useState<string>("전체");
	const [searchTerm, setSearchTerm] = useState<string>("");
	const [dateRangeStart, setDateRangeStart] = useState<string>("");
	const [dateRangeEnd, setDateRangeEnd] = useState<string>("");
	const [showAdvancedFilters, setShowAdvancedFilters] =
		useState<boolean>(false);
	const [sortOption, setSortOption] = useState<DocumentSortOption>({
		field: "createdAt",
		order: "asc",
	});
	const [categoryMap, setCategoryMap] = useState<Map<number, string>>(
		new Map(),
	);
	const [categoryList, setCategoryList] = useState<
		{ id: number; name: string }[]
	>([]);
	const [editTitle, setEditTitle] = useState<string>("");
	const [editCategoryId, setEditCategoryId] = useState<number | undefined>(
		undefined,
	);
	const [isEditSaving, setIsEditSaving] = useState(false);
	const [favoriteStatus, setFavoriteStatus] = useState<Map<number, boolean>>(
		new Map(),
	);
	const [pendingFavoriteIds, setPendingFavoriteIds] = useState<Set<number>>(
		new Set(),
	);
	const [lockStatuses, setLockStatuses] = useState<
		Map<number, { locked: boolean; lockedBy?: string; lockedAt?: string }>
	>(new Map());
	const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
	const [manageModalOpen, setManageModalOpen] = useState<boolean>(false);
	const [selectedDocument, setSelectedDocument] =
		useState<DocumentListItem | null>(null);
	const [expandedSourceIds, setExpandedSourceIds] = useState<Set<number>>(
		new Set(),
	);
	const [copiesBySourceId, setCopiesBySourceId] = useState<
		Map<number, DocumentListItem[]>
	>(new Map());
	const [loadingCopySourceIds, setLoadingCopySourceIds] = useState<Set<number>>(
		new Set(),
	);
	const [generatedCopyCountBySourceId, setGeneratedCopyCountBySourceId] =
		useState<Map<number, number>>(new Map());
	const [copyWorkersBySourceId, setCopyWorkersBySourceId] = useState<
		Map<number, string[]>
	>(new Map());
	const [refreshTick, setRefreshTick] = useState(0);
	const skipLoadingOnceRef = useRef(false);
	const isAdmin =
		user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN;

	type RowItem = DocumentListItem & {
		isCopyRow?: boolean;
		sourceDocumentId?: number;
		isLoadingRow?: boolean;
		rowNumber?: number;
		hasHandoverRequest?: boolean;
	};

	// 카테고리 목록 로드
	useEffect(() => {
		const fetchCategories = async () => {
			try {
				const cats = await categoryApi.getAllCategories();
				const map = new Map<number, string>();
				cats.forEach((cat: CategoryResponse) => map.set(cat.id, cat.name));
				setCategoryMap(map);
				setCategoryList(
					cats.map((cat: CategoryResponse) => ({ id: cat.id, name: cat.name })),
				);
			} catch (error) {
				console.error("카테고리 목록 조회 실패:", error);
			}
		};
		fetchCategories();
	}, []);

	// API에서 문서 목록 가져오기
	useEffect(() => {
		const currentRefreshTick = refreshTick;
		const fetchDocuments = async () => {
			const shouldSkipLoading = skipLoadingOnceRef.current;
			if (shouldSkipLoading) {
				skipLoadingOnceRef.current = false;
			}
			try {
				if (!shouldSkipLoading) {
					setLoading(true);
				}
				if (currentRefreshTick > 0) {
					console.log("🔄 문서 목록 강제 재조회:", currentRefreshTick);
				}
				// 원문만 조회(sourcesOnly) → 목록에는 원본만, 토글 시 해당 원문을 작업 중인 문서(복사본) 표시
				const params: {
					sourcesOnly?: boolean;
					status?: string;
					categoryId?: number;
					title?: string;
				} = { sourcesOnly: true };
				if (searchTerm.trim()) params.title = searchTerm.trim();
				// 상태 필터는 다중 선택이므로 클라이언트에서 적용한다.
				// 카테고리는 클라이언트에서 대분류 기준으로 필터링한다.

				const response = await documentApi.getAllDocuments(params);
				const converted = response.map((doc) =>
					convertToDocumentListItem(doc, categoryMap),
				);
				const draftOnlyCount = converted.filter(
					(doc) =>
						doc.status === DocumentState.DRAFT &&
						(doc.hasVersions === false || doc.hasVersions === undefined),
				).length;
				console.log("📋 임시저장 문서 개수:", draftOnlyCount);
				setDocuments(converted);

				// 관리자 목록 추출 (중복 제거)
				const uniqueManagers = Array.from(
					new Set(converted.map((doc) => doc.assignedManager).filter(Boolean)),
				);
				// managers 상태는 나중에 필요하면 추가
			} catch (error) {
				console.error("문서 목록 조회 실패:", error);
				setDocuments([]);
			} finally {
				setLoading(false);
			}
		};

		fetchDocuments();
	}, [searchTerm, selectedCategory, categoryMap, refreshTick]);

	// 찜 상태 로드 (락 제거됨)
	useEffect(() => {
		const loadStatuses = async () => {
			try {
				const favoriteMap = new Map<number, boolean>();
				await Promise.all(
					documents.map(async (doc) => {
						try {
							const isFavorite = await documentApi
								.isFavorite(doc.id)
								.catch(() => false);
							favoriteMap.set(doc.id, isFavorite);
						} catch (error) {
							console.warn(
								`문서 ${doc.id}의 상태를 가져올 수 없습니다:`,
								error,
							);
							favoriteMap.set(doc.id, false);
						}
					}),
				);
				setFavoriteStatus(favoriteMap);
				setLockStatuses(new Map());
			} catch (error) {
				console.error("상태 로드 실패:", error);
			}
		};
		if (documents.length > 0) {
			loadStatuses();
		}
	}, [documents]);

	const sourceLabelOptions = useMemo(() => {
		const set = new Set<string>();
		for (const doc of documents) {
			const label = getSourceLabel(doc.originalUrl);
			if (label) set.add(label);
		}
		const ordered = ["CREV", "ICR", "CREATION", "ANCIENTPATRIARCHS", "기타"];
		return ordered.filter((v) => set.has(v));
	}, [documents]);

	const myInTranslationBySourceId = useMyInTranslationBySourceId(
		documents,
		user?.id,
	);

	const workerOptions = useMemo(() => {
		const set = new Set<string>();
		for (const workers of copyWorkersBySourceId.values()) {
			for (const worker of workers) set.add(worker);
		}
		return Array.from(set);
	}, [copyWorkersBySourceId]);

	const documentIdsKey = useMemo(
		() =>
			[...documents]
				.map((d) => Number(d.id))
				.filter((id) => !Number.isNaN(id))
				.sort((a, b) => a - b)
				.join(","),
		[documents],
	);

	useEffect(() => {
		if (!documentIdsKey) return;
		const ids = documentIdsKey
			.split(",")
			.map((s) => Number.parseInt(s, 10))
			.filter((n) => !Number.isNaN(n));
		if (ids.length === 0) return;
		let cancelled = false;
		(async () => {
			try {
				const pairs = await Promise.all(
					ids.map(async (id) => {
						try {
							const copies = await documentApi.getCopiesBySourceId(id);
							const workers = Array.from(
								new Set(
									copies
										.map((copy) => copy.createdBy?.name)
										.filter((name): name is string => Boolean(name)),
								),
							);
							return [id, copies.length, workers] as const;
						} catch {
							return [id, 0, [] as string[]] as const;
						}
					}),
				);
				if (cancelled) return;
				const next = new Map<number, number>();
				const workerMap = new Map<number, string[]>();
				for (const [id, count, workers] of pairs) {
					next.set(id, count);
					workerMap.set(id, workers);
				}
				setGeneratedCopyCountBySourceId(next);
				setCopyWorkersBySourceId(workerMap);
			} catch {
				if (!cancelled) {
					setGeneratedCopyCountBySourceId(new Map());
					setCopyWorkersBySourceId(new Map());
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [documentIdsKey]);

	// 필터링 및 정렬
	const filteredAndSortedDocuments = useMemo(() => {
		let filtered = [...documents];

		// 제목 검색 (sourcesOnly 사용 시 프론트에서 필터)
		if (searchTerm.trim()) {
			const term = searchTerm.trim().toLowerCase();
			filtered = filtered.filter((doc) =>
				doc.title?.toLowerCase().includes(term),
			);
		}

		// 카테고리 필터
		if (selectedCategory !== "전체") {
			filtered = filtered.filter((doc) => doc.category === selectedCategory);
		}

		// 사이트 필터
		if (selectedSourceLabel !== "전체") {
			filtered = filtered.filter(
				(doc) =>
					(getSourceLabel(doc.originalUrl) ?? "기타") === selectedSourceLabel,
			);
		}

		// 상태 필터 (다중 선택 OR)
		if (selectedStatuses.length > 0) {
			const matchesStatus = (doc: DocumentListItem): boolean => {
				return selectedStatuses.some((st) => {
					if (st === "임시저장") {
						return (
							doc.status === DocumentState.DRAFT && doc.hasVersions === false
						);
					}
					const statusMap: Record<string, DocumentState> = {
						"번역 대기": DocumentState.PENDING_TRANSLATION,
						"번역 중": DocumentState.IN_TRANSLATION,
						"검토 중": DocumentState.PENDING_REVIEW,
						"승인 완료": DocumentState.APPROVED,
						"게시 완료": DocumentState.PUBLISHED,
					};
					return doc.status === statusMap[st];
				});
			};
			filtered = filtered.filter(matchesStatus);
		}

		// 담당자 필터
		if (selectedManager !== "전체") {
			filtered = filtered.filter(
				(doc) => doc.assignedManager === selectedManager,
			);
		}

		// 우선순위 필터
		if (selectedPriority !== "전체") {
			const priorityMap: Record<string, Priority> = {
				높음: Priority.HIGH,
				중간: Priority.MEDIUM,
				낮음: Priority.LOW,
			};
			filtered = filtered.filter(
				(doc) => doc.priority === priorityMap[selectedPriority],
			);
		}

		// 작성자(작업자) 필터
		if (selectedAuthor !== "전체") {
			filtered = filtered.filter((doc) =>
				(copyWorkersBySourceId.get(Number(doc.id)) ?? []).includes(
					selectedAuthor,
				),
			);
		}

		// 날짜 범위 필터
		if (dateRangeStart) {
			const startDate = new Date(dateRangeStart);
			filtered = filtered.filter((doc) => {
				// 문서의 createdAt을 사용 (실제로는 DocumentResponse에서 가져와야 함)
				// 임시로 모든 문서 통과
				return true;
			});
		}
		if (dateRangeEnd) {
			const endDate = new Date(dateRangeEnd);
			endDate.setHours(23, 59, 59, 999);
			filtered = filtered.filter((doc) => {
				// 문서의 createdAt을 사용
				return true;
			});
		}

		// 정렬
		filtered.sort((a, b) => {
			if (sortOption.field === "generatedCopyCount") {
				const av = generatedCopyCountBySourceId.get(Number(a.id)) ?? 0;
				const bv = generatedCopyCountBySourceId.get(Number(b.id)) ?? 0;
				const primary = sortOption.order === "asc" ? av - bv : bv - av;
				if (primary !== 0) return primary;
				return compareByCreatedAtThenId(a, b);
			}
			if (sortOption.field === "lastModified") {
				// 마지막 수정 시점 정렬 (간단히 시간 문자열로 비교)
				const aTime = a.lastModified || "";
				const bTime = b.lastModified || "";
				const primary =
					sortOption.order === "asc"
						? aTime.localeCompare(bTime)
						: bTime.localeCompare(aTime);
				if (primary !== 0) return primary;
				return compareByCreatedAtThenId(a, b);
			} else if (sortOption.field === "createdAt") {
				const t = compareByCreatedAtThenId(a, b);
				return sortOption.order === "asc" ? t : -t;
			} else if (sortOption.field === "title") {
				const primary =
					sortOption.order === "asc"
						? a.title.localeCompare(b.title)
						: b.title.localeCompare(a.title);
				if (primary !== 0) return primary;
				return compareByCreatedAtThenId(a, b);
			} else if (sortOption.field === "estimatedLength") {
				const av = a.estimatedLength ?? 0;
				const bv = b.estimatedLength ?? 0;
				const primary = sortOption.order === "asc" ? av - bv : bv - av;
				if (primary !== 0) return primary;
				return compareByCreatedAtThenId(a, b);
			}
			return 0;
		});

		return filtered;
	}, [
		documents,
		selectedCategory,
		selectedSourceLabel,
		selectedStatuses,
		selectedManager,
		selectedPriority,
		selectedAuthor,
		searchTerm,
		dateRangeStart,
		dateRangeEnd,
		sortOption,
		generatedCopyCountBySourceId,
		copyWorkersBySourceId,
	]);

	const tableData: RowItem[] = useMemo(() => {
		const rows: RowItem[] = [];
		for (const item of filteredAndSortedDocuments) {
			rows.push({ ...(item as RowItem), isCopyRow: false });
			if (expandedSourceIds.has(item.id)) {
				const copies = copiesBySourceId.get(item.id);
				const isLoading = loadingCopySourceIds.has(item.id);
				if (isLoading && copies === undefined) {
					rows.push({
						id: -item.id,
						title: "이 문서를 수정 중인 문서 불러오는 중…",
						isCopyRow: true,
						sourceDocumentId: item.id,
						isLoadingRow: true,
						rowNumber: 1,
					} as RowItem);
				} else if (Array.isArray(copies)) {
					if (copies.length === 0) {
						rows.push({
							id: -item.id,
							title: "이 원문을 수정 중인 문서가 없습니다.",
							isCopyRow: true,
							sourceDocumentId: item.id,
							isLoadingRow: true,
							rowNumber: 1,
						} as RowItem);
					} else {
						copies.forEach((copy, idx) => {
							rows.push({
								...copy,
								isCopyRow: true,
								sourceDocumentId: item.id,
								rowNumber: idx + 1,
							});
						});
					}
				}
			}
		}
		return rows;
	}, [
		filteredAndSortedDocuments,
		expandedSourceIds,
		copiesBySourceId,
		loadingCopySourceIds,
	]);

	const createdAtRankBySourceId = useMemo(() => {
		const filtered = [...filteredAndSortedDocuments];
		filtered.sort(compareByCreatedAtThenId);
		const map = new Map<number, number>();
		filtered.forEach((d, i) => map.set(Number(d.id), i + 1));
		return map;
	}, [filteredAndSortedDocuments]);

	const toggleSourceExpand = useCallback(
		async (sourceId: number) => {
			const isCurrentlyExpanded = expandedSourceIds.has(sourceId);
			if (isCurrentlyExpanded) {
				setExpandedSourceIds((prev) => {
					const next = new Set(prev);
					next.delete(sourceId);
					return next;
				});
				return;
			}
			setExpandedSourceIds((prev) => new Set(prev).add(sourceId));
			if (!copiesBySourceId.has(sourceId)) {
				setLoadingCopySourceIds((prev) => new Set(prev).add(sourceId));
				try {
					const copies = await documentApi.getCopiesBySourceId(sourceId);
					const withMeta = copies.map((doc) => {
						const listItem = convertToDocumentListItem(doc, categoryMap);
						if (doc.createdBy?.name)
							listItem.currentWorker = doc.createdBy.name;
						(listItem as RowItem).hasHandoverRequest = !!doc.latestHandover;
						if (doc.currentVersionId != null)
							listItem.currentVersionId = doc.currentVersionId;
						if (doc.currentVersionNumber != null)
							listItem.currentVersionNumber = doc.currentVersionNumber;
						if (doc.currentVersionIsFinal != null)
							listItem.isFinal = doc.currentVersionIsFinal;
						return listItem;
					});
					setCopiesBySourceId((prev) => {
						const m = new Map(prev);
						m.set(sourceId, withMeta);
						return m;
					});
				} catch (e) {
					console.warn("이 문서를 수정 중인 문서 목록 조회 실패:", sourceId, e);
					setCopiesBySourceId((prev) => {
						const m = new Map(prev);
						m.set(sourceId, []);
						return m;
					});
				} finally {
					setLoadingCopySourceIds((prev) => {
						const next = new Set(prev);
						next.delete(sourceId);
						return next;
					});
				}
			}
		},
		[expandedSourceIds, copiesBySourceId, categoryMap],
	);

	const handleManage = (doc: DocumentListItem) => {
		setSelectedDocument(doc);
		setEditTitle(doc.title);
		setEditCategoryId(doc.categoryId);
		setManageModalOpen(true);
	};

	const handleManageLockRelease = () => {
		setManageModalOpen(false);
	};

	const handleManageDelete = () => {
		setManageModalOpen(false);
		setDeleteModalOpen(true);
	};

	const handleManageSave = async () => {
		if (!selectedDocument) return;
		if (!editTitle.trim()) {
			alert("문서 제목을 입력해주세요.");
			return;
		}
		try {
			setIsEditSaving(true);
			await documentApi.updateDocument(selectedDocument.id, {
				title: editTitle.trim(),
				categoryId: editCategoryId,
			});
			setDocuments((prev) =>
				prev.map((doc) =>
					doc.id === selectedDocument.id
						? {
								...doc,
								title: editTitle.trim(),
								categoryId: editCategoryId,
								category: editCategoryId
									? (categoryMap.get(editCategoryId) ?? "미분류")
									: "미분류",
							}
						: doc,
				),
			);
			setManageModalOpen(false);
			setSelectedDocument(null);
		} catch (error: any) {
			console.error("문서 수정 실패:", error);
			alert(error?.response?.data?.message || "문서 수정에 실패했습니다.");
		} finally {
			setIsEditSaving(false);
		}
	};

	const handleToggleFavorite = async (
		doc: DocumentListItem,
		e: React.MouseEvent,
	) => {
		e.stopPropagation();
		const docId = Number(doc.id);
		if (pendingFavoriteIds.has(docId)) return;
		const prevFavorite = favoriteStatus.get(doc.id) || false;
		setPendingFavoriteIds((prev) => {
			const next = new Set(prev);
			next.add(docId);
			return next;
		});
		setFavoriteStatus((prev) => {
			const newMap = new Map(prev);
			newMap.set(doc.id, !prevFavorite);
			return newMap;
		});
		try {
			if (prevFavorite) {
				await documentApi.removeFavorite(doc.id);
			} else {
				await documentApi.addFavorite(doc.id);
			}
		} catch (error) {
			console.error("찜 상태 변경 실패:", error);
			// 실패 시 롤백
			setFavoriteStatus((prev) => {
				const newMap = new Map(prev);
				newMap.set(doc.id, prevFavorite);
				return newMap;
			});
			alert("찜 상태를 변경하는데 실패했습니다.");
		} finally {
			setPendingFavoriteIds((prev) => {
				const next = new Set(prev);
				next.delete(docId);
				return next;
			});
		}
	};

	const handleDeleteConfirm = async () => {
		if (!selectedDocument) return;
		try {
			const deletingId = Number(selectedDocument.id);
			const sourceId = Number(
				selectedDocument.sourceDocumentId != null
					? selectedDocument.sourceDocumentId
					: selectedDocument.id,
			);

			await documentApi.deleteDocument(deletingId);

			// 원문/복사본 모두 즉시 반영되도록 문서·트리 상태를 함께 동기화
			setDocuments((prev) =>
				prev.filter((doc) => Number(doc.id) !== deletingId),
			);
			setFavoriteStatus((prev) => {
				const next = new Map(prev);
				next.delete(deletingId);
				return next;
			});
			setExpandedSourceIds((prev) => {
				const next = new Set(prev);
				if (deletingId === sourceId) next.delete(sourceId);
				return next;
			});
			setLoadingCopySourceIds((prev) => {
				const next = new Set(prev);
				next.delete(sourceId);
				return next;
			});
			setCopiesBySourceId((prev) => {
				const next = new Map(prev);
				if (deletingId === sourceId) {
					// 원문 삭제: 해당 트리(복사본 포함) 통째로 제거
					next.delete(sourceId);
				} else {
					// 복사본 삭제: 펼침 상태의 복사본 목록에서 즉시 제거
					const copies = next.get(sourceId);
					if (copies) {
						next.set(
							sourceId,
							copies.filter((copy) => Number(copy.id) !== deletingId),
						);
					}
				}
				return next;
			});

			setDeleteModalOpen(false);
			setSelectedDocument(null);
			// 로컬 상태 반영 실패/경합 케이스 대비: 목록 강제 재조회 트리거
			skipLoadingOnceRef.current = true;
			setRefreshTick((v) => v + 1);
			alert("문서가 삭제되었습니다.");
		} catch (error) {
			console.error("문서 삭제 실패:", error);
			alert("문서 삭제에 실패했습니다.");
		}
	};

	const handleExport = async (doc: DocumentListItem) => {
		try {
			// 문서 상세 정보 가져오기
			const documentDetail = await documentApi.getDocument(doc.id);

			// 현재 버전 가져오기
			let content = "";
			try {
				const currentVersion = await documentApi.getCurrentVersion(doc.id);
				content = currentVersion.content;
			} catch (error) {
				console.warn("버전 정보를 가져올 수 없습니다:", error);
				content = "내용을 불러올 수 없습니다.";
			}

			// HTML 형식으로 내보내기
			const htmlContent = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${documentDetail.title}</title>
  <style>
    body {
      font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
    }
    h1 {
      color: #333;
      border-bottom: 2px solid #696969;
      padding-bottom: 10px;
    }
    .metadata {
      background-color: #f5f5f5;
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }
    .metadata p {
      margin: 5px 0;
      font-size: 14px;
      color: #666;
    }
    .content {
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <h1>${documentDetail.title}</h1>
  <div class="metadata">
    <p><strong>원문 언어:</strong> ${documentDetail.sourceLang}</p>
    <p><strong>번역 언어:</strong> ${documentDetail.targetLang}</p>
    <p><strong>상태:</strong> ${documentDetail.status}</p>
    <p><strong>생성일:</strong> ${new Date(documentDetail.createdAt).toLocaleString("ko-KR")}</p>
    <p><strong>수정일:</strong> ${new Date(documentDetail.updatedAt).toLocaleString("ko-KR")}</p>
    ${documentDetail.originalUrl ? `<p><strong>원본 URL:</strong> <a href="${documentDetail.originalUrl}" target="_blank">${documentDetail.originalUrl}</a></p>` : ""}
  </div>
  <div class="content">
    ${content}
  </div>
</body>
</html>
      `;

			// Blob 생성 및 다운로드
			const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `${documentDetail.title.replace(/[^a-z0-9가-힣]/gi, "_")}_${new Date().toISOString().split("T")[0]}.html`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);

			alert("문서가 HTML 형식으로 내보내졌습니다.");
		} catch (error) {
			console.error("문서 내보내기 실패:", error);
			alert("문서 내보내기에 실패했습니다.");
		}
	};

	const handleColumnSort = useCallback((sortKey: string) => {
		setSortOption((prev) => {
			if (prev.field === sortKey) {
				return {
					field: prev.field,
					order: prev.order === "asc" ? "desc" : "asc",
				};
			}
			if (sortKey === "createdAt") return { field: "createdAt", order: "asc" };
			if (sortKey === "generatedCopyCount")
				return { field: "generatedCopyCount", order: "desc" };
			return { field: sortKey as DocumentSortOption["field"], order: "asc" };
		});
	}, []);

	const toggleStatusFilter = useCallback((status: string) => {
		setSelectedStatuses((prev) =>
			prev.includes(status)
				? prev.filter((s) => s !== status)
				: [...prev, status],
		);
	}, []);

	const expandColumn: TableColumn<RowItem> = {
		key: "expand",
		label: "",
		width: "36px",
		render: (item) => {
			if (item.isCopyRow || (item as RowItem).isLoadingRow) {
				return (
					<span style={{ display: "inline-block", width: 20, marginLeft: 8 }} />
				);
			}
			const expanded = expandedSourceIds.has(item.id);
			const loading = loadingCopySourceIds.has(item.id);
			const copies = copiesBySourceId.get(item.id);
			const count = copies?.length ?? 0;
			return (
				<span
					style={{
						display: "flex",
						alignItems: "center",
						color: colors.primaryText,
					}}
				>
					{expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
					{expanded && loading && (
						<span
							style={{
								fontSize: "11px",
								marginLeft: 4,
								color: colors.secondaryText,
							}}
						>
							…
						</span>
					)}
					{expanded && !loading && count > 0 && (
						<span
							style={{
								fontSize: "11px",
								marginLeft: 4,
								color: colors.secondaryText,
							}}
						>
							({count})
						</span>
					)}
				</span>
			);
		},
	};

	const nColumn: TableColumn<RowItem> = {
		key: "createdAtOrder",
		label: "N",
		sortKey: "createdAt",
		width: "42px",
		align: "center",
		render: (item) => {
			const row = item as RowItem;
			if (row.isLoadingRow)
				return (
					<span style={{ color: colors.secondaryText, fontSize: "12px" }}>
						…
					</span>
				);
			if (row.isCopyRow)
				return (
					<span style={{ color: colors.secondaryText, fontSize: "12px" }} />
				);
			const n = createdAtRankBySourceId.get(Number(item.id));
			return (
				<span
					style={{
						fontSize: "12px",
						color: colors.primaryText,
						fontWeight: 600,
					}}
				>
					{n ?? "—"}
				</span>
			);
		},
	};

	const countColumn: TableColumn<RowItem> = {
		key: "generatedCopyCount",
		label: "생성 문서",
		sortKey: "generatedCopyCount",
		width: "74px",
		align: "center",
		render: (item) => {
			const row = item as RowItem;
			if (row.isLoadingRow)
				return (
					<span style={{ color: colors.secondaryText, fontSize: "12px" }}>
						…
					</span>
				);
			if (row.isCopyRow)
				return (
					<span style={{ color: colors.secondaryText, fontSize: "12px" }} />
				);
			const count = generatedCopyCountBySourceId.get(Number(item.id));
			if (count == null)
				return (
					<span style={{ color: colors.secondaryText, fontSize: "12px" }}>
						…
					</span>
				);
			return (
				<span
					style={{
						fontSize: "12px",
						color: colors.primaryText,
						fontWeight: 600,
					}}
				>
					{count}
				</span>
			);
		},
	};

	const columns: TableColumn<RowItem>[] = [
		nColumn,
		countColumn,
		expandColumn,
		{
			key: "title",
			label: "문서 제목",
			sortKey: "title",
			width: "minmax(0, 3fr)",
			render: (item) => {
				if ((item as RowItem).isLoadingRow) {
					return (
						<span
							style={{
								paddingLeft: 24,
								color: colors.secondaryText,
								fontSize: "12px",
							}}
						>
							{item.title}
						</span>
					);
				}
				const isFavorite = favoriteStatus.get(item.id) || false;
				const sourceLabel = getSourceLabel(item.originalUrl);
				const isFavoritePending = pendingFavoriteIds.has(Number(item.id));
				const isDraftOnly =
					item.status === DocumentState.DRAFT && item.hasVersions === false;
				return (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							paddingLeft: item.isCopyRow ? 24 : 0,
							minWidth: 0,
							overflow: "hidden",
						}}
					>
						{!item.isCopyRow && (
							<button
								onClick={(e) => handleToggleFavorite(item, e)}
								disabled={isFavoritePending}
								style={{
									background: "none",
									border: "none",
									cursor: isFavoritePending ? "not-allowed" : "pointer",
									opacity: isFavoritePending ? 0.55 : 1,
									padding: "4px",
									display: "flex",
									alignItems: "center",
									flexShrink: 0,
									fontSize: "18px",
									color: isFavorite ? "#FFD700" : "#C0C0C0",
									transition: "color 0.2s",
								}}
								title={isFavorite ? "찜 해제" : "찜 추가"}
							>
								{isFavorite ? "★" : "☆"}
							</button>
						)}
						{!item.isCopyRow && isDraftOnly && (
							<span
								style={{
									padding: "2px 6px",
									backgroundColor: "#FFE5B4",
									color: "#8B4513",
									fontSize: "10px",
									borderRadius: "4px",
									fontWeight: 600,
									flexShrink: 0,
								}}
							>
								임시저장
							</span>
						)}
						<span
							style={{
								fontWeight: item.isCopyRow ? 400 : 500,
								color: isDraftOnly && !item.isCopyRow ? "#999" : "#000000",
								fontStyle: isDraftOnly && !item.isCopyRow ? "italic" : "normal",
								minWidth: 0,
								flex: "1 1 auto",
								whiteSpace: "normal",
								overflow: "visible",
								display: "block",
								lineHeight: 1.2,
								wordBreak: "break-word",
							}}
							title={item.title}
						>
							<HighlightText text={item.title} searchTerm={searchTerm} />
						</span>
						{!(item as RowItem).isLoadingRow && sourceLabel && (
							<span
								style={{
									display: "inline-block",
									padding: "2px 5px",
									borderRadius: "4px",
									fontSize: "10px",
									fontWeight: 600,
									backgroundColor:
										sourceLabel === "기타" ? "#F3F4F6" : "#E6F0FF",
									color: sourceLabel === "기타" ? "#6B7280" : "#1D4ED8",
									flexShrink: 0,
									lineHeight: 1.2,
								}}
								title={item.originalUrl || "원문 URL 없음"}
							>
								{sourceLabel}
							</span>
						)}
						{item.isCopyRow && !(item as RowItem).isLoadingRow && (
							<span
								style={{
									fontSize: "11px",
									color: colors.secondaryText,
									flexShrink: 0,
								}}
							>
								(복사본)
							</span>
						)}
					</div>
				);
			},
		},
		{
			key: "category",
			label: "카테고리",
			width: "minmax(0, 0.6fr)",
			render: (item) => (
				<span style={{ color: colors.primaryText, fontSize: "12px" }}>
					{(item as RowItem).isLoadingRow ? "-" : item.category}
				</span>
			),
		},
		{
			key: "status",
			label: "상태",
			width: "minmax(0, 0.7fr)",
			render: (item) => {
				if ((item as RowItem).isLoadingRow)
					return (
						<span style={{ color: colors.secondaryText, fontSize: "12px" }}>
							-
						</span>
					);
				if (!item.isCopyRow) {
					const isDraftOnly =
						item.status === DocumentState.DRAFT && item.hasVersions === false;
					if (isDraftOnly) {
						return (
							<span
								style={{
									display: "inline-block",
									padding: "4px 8px",
									borderRadius: "4px",
									fontSize: "12px",
									fontWeight: 500,
									backgroundColor: "#FFE5B4",
									color: "#8B4513",
								}}
							>
								임시저장
							</span>
						);
					}
					const showMyTranslationBadge =
						myInTranslationBySourceId.get(item.id) === true;
					return (
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: "4px",
								flexWrap: "wrap",
							}}
						>
							<StatusBadge status={item.status} />
							{showMyTranslationBadge && (
								<span
									title="이 원문에 대해 내가 번역 중인 복사본이 있습니다."
									style={{
										display: "inline-block",
										padding: "2px 5px",
										borderRadius: "4px",
										fontSize: "10px",
										fontWeight: 600,
										backgroundColor: "#FFF3E0",
										color: "#E65100",
									}}
								>
									내 번역
								</span>
							)}
						</div>
					);
				}
				if ((item as RowItem).hasHandoverRequest) {
					return (
						<span
							style={{
								display: "inline-block",
								padding: "2px 8px",
								borderRadius: "4px",
								fontSize: "11px",
								fontWeight: 500,
								backgroundColor: "#E8F0E8",
								color: "#2E7D32",
							}}
						>
							인계 요청
						</span>
					);
				}
				return <StatusBadge status={item.status} />;
			},
		},
		{
			key: "lastModified",
			label: "최근 수정",
			sortKey: "lastModified",
			width: "minmax(0, 0.85fr)",
			align: "right",
			render: (item) => (
				<span style={{ color: colors.primaryText, fontSize: "12px" }}>
					{(item as RowItem).isLoadingRow ? "-" : item.lastModified || "-"}
				</span>
			),
		},
		{
			key: "assignedManager",
			label: "담당 관리자",
			width: "minmax(0, 0.7fr)",
			render: (item) => (
				<span style={{ color: colors.primaryText, fontSize: "12px" }}>
					{(item as RowItem).isLoadingRow ? "-" : item.assignedManager || "-"}
				</span>
			),
		},
		{
			key: "lockStatus",
			label: "작업자",
			width: "minmax(0, 0.6fr)",
			render: (item) => {
				if ((item as RowItem).isLoadingRow)
					return (
						<span style={{ color: colors.secondaryText, fontSize: "12px" }}>
							-
						</span>
					);
				if (!item.isCopyRow)
					return (
						<span style={{ color: colors.secondaryText, fontSize: "12px" }}>
							-
						</span>
					);
				return (
					<span style={{ color: colors.primaryText, fontSize: "12px" }}>
						{item.currentWorker || "-"}
					</span>
				);
			},
		},
		{
			key: "currentVersion",
			label: "현재 버전",
			width: "minmax(0, 0.5fr)",
			align: "right",
			render: (item) => {
				if ((item as RowItem).isLoadingRow)
					return (
						<span style={{ color: colors.secondaryText, fontSize: "12px" }}>
							-
						</span>
					);
				if (!item.isCopyRow)
					return (
						<span style={{ color: colors.primaryText, fontSize: "12px" }}>
							v1
						</span>
					);
				return (
					<span style={{ color: colors.primaryText, fontSize: "12px" }}>
						{item.isFinal
							? "FINAL"
							: item.currentVersionNumber != null
								? `v${item.currentVersionNumber}`
								: "-"}
					</span>
				);
			},
		},
		{
			key: "estimatedLength",
			label: "예상 분량",
			sortKey: "estimatedLength",
			width: "minmax(0, 0.65fr)",
			align: "right",
			render: (item) => (
				<span style={{ color: colors.primaryText, fontSize: "12px" }}>
					{(item as RowItem).isLoadingRow
						? "-"
						: item.estimatedLength
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
				if ((item as RowItem).isLoadingRow)
					return (
						<span style={{ color: colors.secondaryText, fontSize: "12px" }}>
							-
						</span>
					);
				return (
					<div
						style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}
					>
						<Button
							variant="secondary"
							onClick={(e) => {
								e?.stopPropagation();
								navigate(`/documents/${item.id}`);
							}}
							style={{ fontSize: "12px", padding: "6px 12px" }}
						>
							상세보기
						</Button>
						<Button
							variant="secondary"
							onClick={(e) => {
								e?.stopPropagation();
								handleManage(item as DocumentListItem);
							}}
							style={{ fontSize: "12px", padding: "6px 12px" }}
						>
							관리
						</Button>
						<Button
							variant="secondary"
							onClick={(e) => {
								e?.stopPropagation();
								handleExport(item as DocumentListItem);
							}}
							style={{ fontSize: "12px", padding: "6px 12px" }}
						>
							내보내기
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
					maxWidth: "1600px",
					margin: "0 auto",
				}}
			>
				<h1
					style={{
						fontSize: "20px",
						fontWeight: 600,
						color: "#000000",
						marginBottom: "24px",
					}}
				>
					전체 문서
				</h1>

				{/* 검색 바 */}
				<div
					style={{
						backgroundColor: colors.surface,
						border: `1px solid ${colors.border}`,
						borderRadius: "8px",
						padding: "16px",
						marginBottom: "16px",
					}}
				>
					<div
						style={{
							display: "flex",
							gap: "12px",
							alignItems: "center",
							marginBottom: "12px",
						}}
					>
						<input
							type="text"
							placeholder="문서 제목 검색..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							style={{
								flex: 1,
								padding: "8px 12px",
								border: `1px solid ${colors.border}`,
								borderRadius: "4px",
								fontSize: "14px",
								backgroundColor: colors.surface,
								color: "#000000",
							}}
						/>
						<Button
							variant="secondary"
							onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
							style={{ fontSize: "13px", padding: "8px 16px" }}
						>
							{showAdvancedFilters ? "고급 필터 숨기기" : "고급 필터"}
						</Button>
					</div>

					{/* 고급 필터 */}
					{showAdvancedFilters && (
						<div
							style={{
								display: "flex",
								gap: "12px",
								alignItems: "center",
								flexWrap: "wrap",
								paddingTop: "12px",
								borderTop: `1px solid ${colors.border}`,
							}}
						>
							<div
								style={{ display: "flex", gap: "8px", alignItems: "center" }}
							>
								<label style={{ fontSize: "13px", color: colors.primaryText }}>
									날짜 범위:
								</label>
								<input
									type="date"
									value={dateRangeStart}
									onChange={(e) => setDateRangeStart(e.target.value)}
									style={{
										padding: "4px 8px",
										border: `1px solid ${colors.border}`,
										borderRadius: "4px",
										fontSize: "13px",
									}}
								/>
								<span style={{ fontSize: "13px", color: colors.primaryText }}>
									~
								</span>
								<input
									type="date"
									value={dateRangeEnd}
									onChange={(e) => setDateRangeEnd(e.target.value)}
									style={{
										padding: "4px 8px",
										border: `1px solid ${colors.border}`,
										borderRadius: "4px",
										fontSize: "13px",
									}}
								/>
							</div>

							<div
								style={{ display: "flex", gap: "8px", alignItems: "center" }}
							>
								<label style={{ fontSize: "13px", color: colors.primaryText }}>
									우선순위:
								</label>
								<select
									value={selectedPriority}
									onChange={(e) => setSelectedPriority(e.target.value)}
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
									<option value="전체">전체</option>
									<option value="높음">높음</option>
									<option value="중간">중간</option>
									<option value="낮음">낮음</option>
								</select>
							</div>
						</div>
					)}
				</div>

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
						<div
							style={{
								display: "inline-flex",
								gap: "6px",
								alignItems: "center",
								flexWrap: "wrap",
							}}
						>
							<button
								type="button"
								onClick={() => setSelectedCategory("전체")}
								style={{
									padding: "4px 10px",
									fontSize: "12px",
									borderRadius: "999px",
									cursor: "pointer",
									border:
										selectedCategory === "전체"
											? "1px solid #93C5FD"
											: `1px solid ${colors.border}`,
									backgroundColor:
										selectedCategory === "전체" ? "#EFF6FF" : colors.surface,
									color:
										selectedCategory === "전체"
											? "#1D4ED8"
											: colors.primaryText,
									fontWeight: selectedCategory === "전체" ? 600 : 500,
									outline: "none",
									boxShadow: "none",
								}}
							>
								전체
							</button>
							{categories
								.filter((c) => c !== "전체")
								.map((cat) => {
									const on = selectedCategory === cat;
									return (
										<button
											key={cat}
											type="button"
											onClick={() => setSelectedCategory(cat)}
											style={{
												padding: "4px 10px",
												fontSize: "12px",
												borderRadius: "999px",
												cursor: "pointer",
												border: on
													? "1px solid #93C5FD"
													: `1px solid ${colors.border}`,
												backgroundColor: on ? "#EFF6FF" : colors.surface,
												color: on ? "#1D4ED8" : colors.primaryText,
												fontWeight: on ? 600 : 500,
												outline: "none",
												boxShadow: "none",
											}}
										>
											{cat}
										</button>
									);
								})}
						</div>
					</div>

					<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
						<label style={{ fontSize: "13px", color: colors.primaryText }}>
							상태:
						</label>
						<div
							style={{
								display: "inline-flex",
								gap: "6px",
								alignItems: "center",
								flexWrap: "wrap",
							}}
						>
							{statuses.map((status) => {
								const on =
									status === "전체"
										? selectedStatuses.length === 0
										: selectedStatuses.includes(status);
								const st = statusChipStyles[status];
								return (
									<button
										key={status}
										type="button"
										onClick={() => {
											if (status === "전체") {
												setSelectedStatuses([]);
											} else {
												toggleStatusFilter(status);
											}
										}}
										style={{
											padding: "4px 10px",
											fontSize: "12px",
											borderRadius: "999px",
											cursor: "pointer",
											border: on
												? `1px solid ${status === "전체" ? "#93C5FD" : st.border}`
												: `1px solid ${colors.border}`,
											backgroundColor: on
												? status === "전체"
													? "#EFF6FF"
													: st.bg
												: colors.surface,
											color:
												status === "전체"
													? on
														? "#1D4ED8"
														: colors.primaryText
													: st.text,
											opacity: on ? 1 : 0.85,
											fontWeight: on ? 600 : 500,
											outline: "none",
											boxShadow: "none",
										}}
									>
										{status}
									</button>
								);
							})}
						</div>
					</div>

					<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
						<label style={{ fontSize: "13px", color: colors.primaryText }}>
							사이트:
						</label>
						<select
							value={selectedSourceLabel}
							onChange={(e) => setSelectedSourceLabel(e.target.value)}
							style={{
								padding: "6px 10px",
								border: `1px solid ${colors.border}`,
								borderRadius: "4px",
								fontSize: "13px",
								backgroundColor: colors.surface,
								color: "#000000",
								cursor: "pointer",
								minWidth: "94px",
							}}
						>
							<option value="전체">전체</option>
							{sourceLabelOptions.map((label) => (
								<option key={label} value={label}>
									{label}
								</option>
							))}
						</select>
					</div>

					<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
						<label style={{ fontSize: "13px", color: colors.primaryText }}>
							담당자:
						</label>
						<select
							value={selectedManager}
							onChange={(e) => setSelectedManager(e.target.value)}
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
							<option value="전체">전체</option>
							{Array.from(
								new Set(
									documents.map((doc) => doc.assignedManager).filter(Boolean),
								),
							).map((manager) => (
								<option key={manager} value={manager}>
									{manager}
								</option>
							))}
						</select>
					</div>

					<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
						<label style={{ fontSize: "13px", color: colors.primaryText }}>
							작업자:
						</label>
						<select
							value={selectedAuthor}
							onChange={(e) => setSelectedAuthor(e.target.value)}
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
							<option value="전체">전체</option>
							{workerOptions.map((author) => (
								<option key={author} value={author}>
									{author}
								</option>
							))}
						</select>
					</div>
				</div>

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
						data={tableData}
						onRowClick={(item) => {
							if ((item as RowItem).isLoadingRow) return;
							if (item.isCopyRow) {
								navigate(`/documents/${item.id}`);
							} else {
								toggleSourceExpand(item.id);
							}
						}}
						getRowStyle={(item) => {
							const row = item as RowItem;
							if (row.isLoadingRow) {
								return {
									backgroundColor: "#E8E8E8",
									borderLeft: "4px solid #B0B0B0",
								};
							}
							if (row.isCopyRow) {
								return {
									backgroundColor: "#E0E0E0",
									borderLeft: "4px solid #909090",
								};
							}
							if (expandedSourceIds.has(row.id)) {
								return {
									backgroundColor: "#F0F0F0",
									borderLeft: "3px solid #707070",
								};
							}
							return {};
						}}
						getRowHoverStyle={(item) => {
							const row = item as RowItem;
							if (row.isCopyRow || row.isLoadingRow)
								return { backgroundColor: "#C8C8C8" };
							return undefined;
						}}
						emptyMessage="문서가 없습니다."
						sortField={sortOption.field}
						sortOrder={sortOption.order}
						onColumnSort={handleColumnSort}
					/>
				)}

				{/* 삭제 확인 모달 */}
				<Modal
					isOpen={deleteModalOpen}
					onClose={() => {
						setDeleteModalOpen(false);
						setSelectedDocument(null);
					}}
					title="문서 삭제 확인"
					onConfirm={handleDeleteConfirm}
					confirmText="삭제"
					cancelText="취소"
					variant="danger"
				>
					{selectedDocument && (
						<div
							style={{
								fontSize: "13px",
								color: colors.primaryText,
								lineHeight: 1.6,
							}}
						>
							<p style={{ marginBottom: "8px" }}>
								정말로 "<strong>{selectedDocument.title}</strong>" 문서를
								삭제하시겠습니까?
							</p>
							{selectedDocument.sourceDocumentId == null ? (
								<p style={{ marginBottom: "8px", color: "#b91c1c" }}>
									이 문서는 <strong>원문</strong>입니다. 이 문서를 삭제하면
									<br />이 원문을 기반으로 생성된{" "}
									<strong>모든 복사본(다른 사람이 작업 중인 문서 포함)</strong>
									이 함께 삭제됩니다.
								</p>
							) : (
								<p style={{ marginBottom: "8px", color: colors.secondaryText }}>
									이 문서는 <strong>복사본</strong>입니다. 이 문서만 삭제되며,
									원문과 다른 복사본에는 영향이 없습니다.
								</p>
							)}
							<p style={{ marginTop: "4px" }}>이 작업은 되돌릴 수 없습니다.</p>
						</div>
					)}
				</Modal>

				{/* 문서 관리 모달 */}
				{manageModalOpen && selectedDocument && (
					<div
						style={{
							position: "fixed",
							top: 0,
							left: 0,
							right: 0,
							bottom: 0,
							backgroundColor: "rgba(0, 0, 0, 0.5)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							zIndex: 1000,
						}}
						onClick={() => {
							setManageModalOpen(false);
							setSelectedDocument(null);
						}}
					>
						<div
							style={{
								backgroundColor: colors.surface,
								borderRadius: "8px",
								padding: "24px",
								maxWidth: "480px",
								width: "90%",
								boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
							}}
							onClick={(e) => e.stopPropagation()}
						>
							<h2
								style={{
									fontSize: "18px",
									fontWeight: 600,
									color: "#000000",
									marginBottom: "16px",
								}}
							>
								문서 관리
							</h2>
							<div
								style={{
									marginBottom: "20px",
									color: colors.primaryText,
									fontSize: "14px",
								}}
							>
								{/* 제목 편집 */}
								<div style={{ marginBottom: "12px" }}>
									<label
										style={{
											display: "block",
											fontSize: "12px",
											fontWeight: 600,
											marginBottom: "4px",
											color: colors.primaryText,
										}}
									>
										제목
									</label>
									<input
										type="text"
										value={editTitle}
										onChange={(e) => setEditTitle(e.target.value)}
										style={{
											width: "100%",
											padding: "8px 10px",
											border: `1px solid ${colors.border}`,
											borderRadius: "4px",
											fontSize: "14px",
											color: "#000",
											boxSizing: "border-box",
										}}
									/>
								</div>
								{/* 카테고리 편집 */}
								<div style={{ marginBottom: "12px" }}>
									<label
										style={{
											display: "block",
											fontSize: "12px",
											fontWeight: 600,
											marginBottom: "4px",
											color: colors.primaryText,
										}}
									>
										카테고리
									</label>
									<select
										value={editCategoryId ?? ""}
										onChange={(e) =>
											setEditCategoryId(
												e.target.value ? Number(e.target.value) : undefined,
											)
										}
										style={{
											width: "100%",
											padding: "8px 10px",
											border: `1px solid ${colors.border}`,
											borderRadius: "4px",
											fontSize: "14px",
											color: "#000",
											backgroundColor: "#fff",
											boxSizing: "border-box",
										}}
									>
										<option value="">미분류</option>
										{categoryList.map((cat) => (
											<option key={cat.id} value={cat.id}>
												{cat.name}
											</option>
										))}
									</select>
								</div>
								<p style={{ marginBottom: "8px", fontSize: "13px" }}>
									<strong>상태:</strong>{" "}
									{{
										DRAFT: "초안",
										PENDING_TRANSLATION: "번역 대기",
										IN_TRANSLATION: "번역 중",
										PENDING_REVIEW: "검토 대기",
										APPROVED: "번역 완료",
										PUBLISHED: "공개됨",
									}[selectedDocument.status] || selectedDocument.status}
								</p>
								<p style={{ marginBottom: "12px", fontSize: "13px" }}>
									<strong>최근 수정:</strong>{" "}
									{selectedDocument.lastModified || "-"}
								</p>
								{(() => {
									const lockStatus = lockStatuses.get(selectedDocument.id);
									const isOld = lockStatus?.locked
										? isLockOld(lockStatus.lockedAt)
										: false;
									return (
										<div
											style={{
												padding: "12px",
												backgroundColor: lockStatus?.locked
													? isOld
														? "#fff5f5"
														: "#f8f9fa"
													: "#f8f9fa",
												borderRadius: "4px",
											}}
										>
											<p style={{ marginBottom: "4px" }}>
												<strong>현재 작업자:</strong>{" "}
												{lockStatus?.locked
													? lockStatus.lockedBy || "알 수 없음"
													: "-"}
											</p>
											<p style={{ marginBottom: 0, fontSize: "13px" }}>
												<strong>작업 시작 시각:</strong>{" "}
												{lockStatus?.locked && lockStatus.lockedAt
													? formatLastModifiedDateDisplay(lockStatus.lockedAt)
													: "-"}
											</p>
											{lockStatus?.locked && isOld && (
												<p
													style={{
														marginTop: "8px",
														marginBottom: 0,
														color: "#dc3545",
														fontSize: "12px",
													}}
												>
													24시간 이상 편집 중입니다. 필요 시 편집 권한을 회수할
													수 있습니다.
												</p>
											)}
										</div>
									);
								})()}
							</div>
							<div
								style={{
									display: "flex",
									gap: "8px",
									justifyContent: "flex-end",
									flexWrap: "wrap",
								}}
							>
								<Button
									variant="secondary"
									onClick={() => {
										setManageModalOpen(false);
										setSelectedDocument(null);
									}}
								>
									닫기
								</Button>
								<Button
									variant={isEditSaving ? "disabled" : "primary"}
									onClick={handleManageSave}
									style={{ fontSize: "13px", padding: "8px 16px" }}
								>
									{isEditSaving ? "저장 중..." : "저장"}
								</Button>
								{isAdmin && (
									<Button
										variant="danger"
										onClick={handleManageDelete}
										style={{ fontSize: "13px", padding: "8px 16px" }}
									>
										삭제
									</Button>
								)}
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
