import type React from "react";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Table, type TableColumn } from "../components/Table";
import { ChevronDown, ChevronRight, Star } from "lucide-react";
import {
	type DocumentListItem,
	Priority,
	DocumentFilter,
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
import {
	translationWorkApi,
	type LockStatusResponse,
} from "../services/translationWorkApi";
import { formatLastModifiedDate } from "../utils/dateUtils";
import { formatTranslationListVersionLabel } from "../utils/versionDisplay";
import {
	minorNamesForMajor,
	splitCategoryName,
	uniqueSortedMajorNames,
} from "../utils/categoryHierarchy";
import { StatusBadge } from "../components/StatusBadge";
import {
	DOCUMENT_STATUS_LABELS,
	DOCUMENT_STATUS_ORDER,
	DOCUMENT_STATUS_STYLES,
} from "../constants/documentStatusLabels";
import { useUser } from "../contexts/UserContext";
import { UserRole } from "../types/user";

/** 원문·복사본 공통: 빈 배열 = 전체, 그 외 = 선택한 DocumentState 중 하나와 같으면 일치 */
function documentMatchesStatusFilter(
	status: DocumentState | string | null | undefined,
	filters: DocumentState[],
): boolean {
	if (filters.length === 0) return true;
	const s = status == null ? "" : String(status);
	return filters.some((f) => s === f);
}

function compareByCreatedAtThenId(
	a: DocumentListItem,
	b: DocumentListItem,
): number {
	const ac = a.createdAt || "";
	const bc = b.createdAt || "";
	const t = ac.localeCompare(bc);
	if (t !== 0) return t;
	return a.id - b.id;
}

function compareDocumentsForSort(
	a: DocumentListItem,
	b: DocumentListItem,
	sort: DocumentSortOption,
): number {
	if (sort.field === "createdAt") {
		const t = compareByCreatedAtThenId(a, b);
		return sort.order === "asc" ? t : -t;
	}
	let primary = 0;
	if (sort.field === "lastModified") {
		const aTime = a.lastModified || "";
		const bTime = b.lastModified || "";
		primary =
			sort.order === "asc"
				? aTime.localeCompare(bTime)
				: bTime.localeCompare(aTime);
	} else if (sort.field === "title") {
		primary =
			sort.order === "asc"
				? a.title.localeCompare(b.title)
				: b.title.localeCompare(a.title);
	} else if (sort.field === "estimatedLength") {
		const av = a.estimatedLength ?? 0;
		const bv = b.estimatedLength ?? 0;
		primary = sort.order === "asc" ? av - bv : bv - av;
	}
	if (primary !== 0) return primary;
	return compareByCreatedAtThenId(a, b);
}

/**
 * HTML에서 문단 수를 계산하는 함수
 * data-paragraph-index 속성이 있으면 그것을 사용하고, 없으면 문단 요소를 직접 찾아서 계산
 */
function countParagraphs(html: string): number {
	if (!html || html.trim().length === 0) {
		return 0;
	}

	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, "text/html");
		const body = doc.body;

		// data-paragraph-index 속성이 있는 요소들 찾기
		const indexedParagraphs = body.querySelectorAll("[data-paragraph-index]");
		if (indexedParagraphs.length > 0) {
			// 인덱스가 있으면 최대 인덱스 + 1이 문단 수
			let maxIndex = -1;
			indexedParagraphs.forEach((el) => {
				const indexStr = (el as HTMLElement).getAttribute(
					"data-paragraph-index",
				);
				if (indexStr) {
					const index = Number.parseInt(indexStr, 10);
					if (!isNaN(index) && index > maxIndex) {
						maxIndex = index;
					}
				}
			});
			return maxIndex + 1;
		}

		// 인덱스가 없으면 문단 요소를 직접 찾아서 계산
		const paragraphSelectors =
			"p, h1, h2, h3, h4, h5, h6, div, li, blockquote, article, section, figure, figcaption";
		const elements = body.querySelectorAll(paragraphSelectors);
		let count = 0;
		elements.forEach((el) => {
			const text = el.textContent?.trim();
			const hasImages = el.querySelectorAll("img").length > 0;
			if ((text && text.length > 0) || hasImages) {
				count++;
			}
		});
		return count;
	} catch (error) {
		console.error("문단 수 계산 실패:", error);
		return 0;
	}
}

/**
 * 진행률 계산 함수
 * @param completedParagraphs 완료된 문단 인덱스 배열
 * @param totalParagraphs 전체 문단 수
 * @returns 진행률 (0-100)
 */
function calculateProgress(
	completedParagraphs: number[] | undefined,
	totalParagraphs: number,
): number {
	if (!completedParagraphs || completedParagraphs.length === 0) {
		return 0;
	}
	if (totalParagraphs === 0) {
		return 0;
	}
	return Math.round((completedParagraphs.length / totalParagraphs) * 100);
}

// DocumentResponse를 DocumentListItem으로 변환
const convertToDocumentListItem = (
	doc: DocumentResponse & {
		lockInfo?: LockStatusResponse | null;
		originalVersion?: DocumentVersionResponse | null;
	},
	categoryMap?: Map<number, string>,
): DocumentListItem => {
	// 진행률 계산
	let progress = 0;

	if (doc.status === "APPROVED") {
		progress = 100; // 완료된 문서는 100%
	} else if (doc.status === "IN_TRANSLATION") {
		// IN_TRANSLATION 상태인 경우 진행률 계산
		if (doc.originalVersion?.content) {
			const totalParagraphs = countParagraphs(doc.originalVersion.content);
			if (totalParagraphs > 0) {
				// completedParagraphs가 있으면 사용, 없으면 0%
				const completedCount = doc.completedParagraphs?.length || 0;
				progress = Math.round((completedCount / totalParagraphs) * 100);
			} else {
				console.warn(`⚠️ 문서 ${doc.id}: 문단 수가 0입니다.`);
			}
		} else {
			console.warn(`⚠️ 문서 ${doc.id}: ORIGINAL 버전을 찾을 수 없습니다.`);
		}
	}
	// PENDING_TRANSLATION 상태는 기본값 0% 유지

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

	// 카테고리 이름 (카테고리 맵에서 조회)
	const category =
		doc.categoryId && categoryMap
			? categoryMap.get(doc.categoryId) || `카테고리 ${doc.categoryId}`
			: doc.categoryId
				? `카테고리 ${doc.categoryId}`
				: "미분류";

	return {
		id: doc.id,
		title: doc.title,
		category,
		categoryId: doc.categoryId,
		estimatedLength: doc.estimatedLength,
		progress,
		deadline,
		priority,
		status: doc.status as DocumentState,
		lastModified: doc.updatedAt
			? formatLastModifiedDate(doc.updatedAt)
			: undefined,
		createdAt: doc.createdAt,
		assignedManager: doc.lastModifiedBy?.name,
		isFinal: !!(doc as DocumentResponse).currentVersionIsFinal,
		originalUrl: doc.originalUrl,
	};
};

export default function TranslationsPending() {
	const navigate = useNavigate();
	const { user } = useUser();
	const isAdmin =
		user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN;
	const [documents, setDocuments] = useState<DocumentListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	/** 카테고리: 대분류·소분류 (이름이 `대-소` 형태일 때만 소분류 표시) */
	const [selectedCategoryMajor, setSelectedCategoryMajor] =
		useState<string>("전체");
	const [selectedCategoryMinor, setSelectedCategoryMinor] =
		useState<string>("전체");
	/** 비어 있으면 전체(필터 없음). 여러 개 선택 시 OR 조건 */
	const [selectedStatuses, setSelectedStatuses] = useState<DocumentState[]>([]);
	const [sortOption, setSortOption] = useState<DocumentSortOption>({
		field: "createdAt",
		order: "asc",
	});
	const [categoryMap, setCategoryMap] = useState<Map<number, string>>(
		new Map(),
	);
	const [favoriteStatus, setFavoriteStatus] = useState<Map<number, boolean>>(
		new Map(),
	);
	const [expandedSourceIds, setExpandedSourceIds] = useState<Set<number>>(
		new Set(),
	);
	const [copiesBySourceId, setCopiesBySourceId] = useState<
		Map<number, DocumentListItem[]>
	>(new Map());
	/** 배치 API로 받은 원문별 번역 중(IN_TRANSLATION) 복사본 수 — 인원 칸 전용 */
	const [inTranslationCountBySourceId, setInTranslationCountBySourceId] =
		useState<Map<number, number>>(() => new Map());
	/** 해당 원문의 복사본(수정 중인 사람들의 문서) 로딩 중인 원문 ID */
	const [loadingCopySourceIds, setLoadingCopySourceIds] = useState<Set<number>>(
		new Set(),
	);
	const [startTranslationLoading, setStartTranslationLoading] = useState(false);
	const [continueTranslationLoading, setContinueTranslationLoading] =
		useState(false);

	const copiesBySourceIdRef = useRef(copiesBySourceId);
	copiesBySourceIdRef.current = copiesBySourceId;

	// 카테고리 목록 로드
	useEffect(() => {
		const loadCategories = async () => {
			try {
				const categoryList = await categoryApi.getAllCategories();
				const map = new Map<number, string>();
				categoryList.forEach((cat) => {
					map.set(cat.id, cat.name);
				});
				setCategoryMap(map);
				console.log("✅ 카테고리 목록 로드 완료:", categoryList.length, "개");
			} catch (error) {
				console.error("카테고리 목록 로드 실패:", error);
			}
		};
		loadCategories();
	}, []);

	// 찜 상태 로드
	useEffect(() => {
		const loadFavoriteStatus = async () => {
			try {
				const favoriteMap = new Map<number, boolean>();
				await Promise.all(
					documents.map(async (doc) => {
						try {
							const isFavorite = await documentApi.isFavorite(doc.id);
							favoriteMap.set(doc.id, isFavorite);
						} catch (error) {
							console.warn(
								`문서 ${doc.id}의 찜 상태를 가져올 수 없습니다:`,
								error,
							);
							favoriteMap.set(doc.id, false);
						}
					}),
				);
				setFavoriteStatus(favoriteMap);
			} catch (error) {
				console.error("찜 상태 로드 실패:", error);
			}
		};
		if (documents.length > 0) {
			loadFavoriteStatus();
		}
	}, [documents]);

	// API에서 문서 목록 가져오기
	useEffect(() => {
		const fetchDocuments = async () => {
			try {
				setLoading(true);
				setError(null);
				console.log("📋 번역 문서 목록 조회 시작...");

				// 원문만 조회(sourcesOnly): 복사본 생성 후에도 원문이 리스트에서 사라지지 않도록
				const response = await documentApi.getAllDocuments({
					sourcesOnly: true,
				});
				console.log("✅ 문서 목록 조회 성공(원문만):", response.length, "개");
				console.log("📊 문서 상태 분포:", {
					전체: response.length,
					PENDING_TRANSLATION: response.filter(
						(d) => d.status === "PENDING_TRANSLATION",
					).length,
					IN_TRANSLATION: response.filter((d) => d.status === "IN_TRANSLATION")
						.length,
					기타: response.filter(
						(d) =>
							!["PENDING_TRANSLATION", "IN_TRANSLATION"].includes(d.status),
					).length,
				});

				// 번역 관련 상태 문서만 (원문은 이미 sourcesOnly로만 옴)
				const pendingDocs = response.filter((doc) =>
					[
						"PENDING_TRANSLATION",
						"IN_TRANSLATION",
						"PENDING_REVIEW",
						"APPROVED",
						"PUBLISHED",
					].includes(doc.status),
				);
				console.log("📌 번역 관련 문서(원본만):", pendingDocs.length, "개");

				// 각 문서에 ORIGINAL 버전 추가 (락 제거됨, completedParagraphs는 문서 응답에 포함)
				const docsWithLockInfo = await Promise.all(
					pendingDocs.map(async (doc) => {
						let originalVersion = null;
						let currentVersionNumber: number | null = null;
						let userFacingVersionNumber: number | null | undefined =
							doc.userFacingVersionNumber;

						// 진행률 계산을 위해 ORIGINAL 버전 가져오기
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
							if (originalVersion) {
								console.log(`📄 문서 ${doc.id} ORIGINAL 버전:`, {
									versionId: originalVersion.id,
									hasContent: !!originalVersion.content,
									contentLength: originalVersion.content?.length || 0,
								});
							} else {
								console.warn(
									`⚠️ 문서 ${doc.id}: ORIGINAL 버전을 찾을 수 없습니다. 버전 목록:`,
									versions.map((v) => v.versionType),
								);
							}
						} catch (error) {
							console.warn(
								`문서 ${doc.id}의 버전 정보를 가져올 수 없습니다:`,
								error,
							);
						}

						return {
							...doc,
							lockInfo: null as LockStatusResponse | null,
							originalVersion,
							currentVersionNumber,
							userFacingVersionNumber,
						};
					}),
				);

				const converted = docsWithLockInfo.map((doc) => {
					const item = convertToDocumentListItem(doc, categoryMap);
					// 작업자: 문서 생성자 또는 마지막 수정자 (락 제거됨)
					if (
						["PENDING_REVIEW", "APPROVED", "PUBLISHED"].includes(doc.status) &&
						doc.lastModifiedBy?.name
					) {
						item.currentWorker = doc.lastModifiedBy.name;
					} else if (doc.status === "IN_TRANSLATION" && doc.createdBy?.name) {
						item.currentWorker = doc.createdBy.name;
					}
					if (doc.currentVersionId)
						item.currentVersionId = doc.currentVersionId;
					if (doc.currentVersionNumber != null)
						item.currentVersionNumber = doc.currentVersionNumber;
					if (doc.userFacingVersionNumber != null)
						item.userFacingVersionNumber = doc.userFacingVersionNumber;
					if (doc.currentVersionIsFinal != null)
						item.isFinal = doc.currentVersionIsFinal;
					if (doc.adminTranslationSessionActive != null)
						item.adminTranslationSessionActive =
							doc.adminTranslationSessionActive;
					if (doc.adminSessionCopyDocumentId != null)
						item.adminSessionCopyDocumentId = doc.adminSessionCopyDocumentId;
					if (doc.adminSessionUser)
						item.adminSessionUser = doc.adminSessionUser;
					return item;
				});
				setDocuments(converted);

				if (converted.length === 0 && response.length > 0) {
					console.warn(
						"⚠️ 목록에 맞는 문서가 없습니다. 다른 상태의 문서만 존재합니다.",
					);
				}
			} catch (error) {
				console.error("❌ 문서 목록 조회 실패:", error);
				if (error instanceof Error) {
					console.error("에러 메시지:", error.message);
					console.error("에러 스택:", error.stack);
					setError(`문서 목록을 불러오는데 실패했습니다: ${error.message}`);
				} else {
					setError("문서 목록을 불러오는데 실패했습니다.");
				}
				setDocuments([]);
			} finally {
				setLoading(false);
			}
		};

		fetchDocuments();
	}, [categoryMap]);

	type RowItem = DocumentListItem & {
		isCopyRow?: boolean;
		sourceDocumentId?: number;
		isLoadingRow?: boolean;
		createdById?: number;
		rowNumber?: number;
		hasHandoverRequest?: boolean;
	};

	const toggleStatusFilter = useCallback((st: DocumentState) => {
		setSelectedStatuses((prev) =>
			prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st],
		);
	}, []);

	const mapCopiesResponseToListItems = useCallback(
		(docs: DocumentResponse[]): DocumentListItem[] => {
			return docs.map((doc) => {
				const listItem = convertToDocumentListItem(
					{
						...doc,
						originalVersion: undefined,
						lockInfo: null as LockStatusResponse | null,
					},
					categoryMap,
				);
				if (doc.createdBy?.name) listItem.currentWorker = doc.createdBy.name;
				if (doc.createdBy?.id != null)
					(listItem as RowItem).createdById = doc.createdBy.id;
				(listItem as RowItem).hasHandoverRequest = !!doc.latestHandover;
				if (doc.currentVersionId)
					listItem.currentVersionId = doc.currentVersionId;
				if (doc.currentVersionNumber != null)
					listItem.currentVersionNumber = doc.currentVersionNumber;
				if (doc.userFacingVersionNumber != null)
					listItem.userFacingVersionNumber = doc.userFacingVersionNumber;
				if (doc.currentVersionIsFinal != null)
					listItem.isFinal = doc.currentVersionIsFinal;
				if (doc.adminTranslationSessionActive != null)
					listItem.adminTranslationSessionActive =
						doc.adminTranslationSessionActive;
				if (doc.adminSessionCopyDocumentId != null)
					listItem.adminSessionCopyDocumentId = doc.adminSessionCopyDocumentId;
				if (doc.adminSessionUser)
					listItem.adminSessionUser = doc.adminSessionUser;
				return listItem;
			});
		},
		[categoryMap],
	);

	const categoryMajorOptions = useMemo(
		() => uniqueSortedMajorNames(categoryMap.values()),
		[categoryMap],
	);

	const categoryMinorOptions = useMemo(
		() =>
			selectedCategoryMajor === "전체"
				? []
				: minorNamesForMajor(categoryMap.values(), selectedCategoryMajor),
		[categoryMap, selectedCategoryMajor],
	);

	const documentMatchesCategoryFilter = useCallback(
		(doc: DocumentListItem) => {
			if (selectedCategoryMajor === "전체") return true;
			const p = splitCategoryName(doc.category);
			if (!p) return false;
			if (p.major !== selectedCategoryMajor) return false;
			if (selectedCategoryMinor === "전체") return true;
			return p.minor === selectedCategoryMinor;
		},
		[selectedCategoryMajor, selectedCategoryMinor],
	);

	/** 현재 카테고리에 해당하는 원문 id (복사본 프리패치·순번 N용) */
	const documentIdsInCategory = useMemo(() => {
		const filtered = [...documents].filter(documentMatchesCategoryFilter);
		return filtered.map((d) => d.id);
	}, [documents, documentMatchesCategoryFilter]);

	/** 생성일 오름차순(동일 시 id) 기준 고정 순번 — 정렬과 무관하게 같은 문서는 항상 같은 N */
	const createdAtRankBySourceId = useMemo(() => {
		const filtered = [...documents].filter(documentMatchesCategoryFilter);
		filtered.sort(compareByCreatedAtThenId);
		const map = new Map<number, number>();
		filtered.forEach((d, i) => map.set(d.id, i + 1));
		return map;
	}, [documents, documentMatchesCategoryFilter]);

	const documentIdsKey = useMemo(
		() => [...documentIdsInCategory].sort((a, b) => a - b).join(","),
		[documentIdsInCategory],
	);

	/** 인원 칸: 원문 id 목록에 대해 번역 중 복사본 수만 한 번에 조회 */
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
				const raw = await documentApi.getInTranslationCopyCounts(ids);
				if (cancelled) return;
				const next = new Map<number, number>();
				for (const id of ids) {
					const v = raw[String(id)] ?? (raw as Record<number, number>)[id];
					next.set(id, typeof v === "number" && !Number.isNaN(v) ? v : 0);
				}
				setInTranslationCountBySourceId(next);
			} catch {
				if (!cancelled) setInTranslationCountBySourceId(new Map());
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [documentIdsKey]);

	/** 카테고리 + 정렬만 (상태는 원문·복사본 일치 여부로 별도 처리) */
	const categoryFilteredAndSortedDocuments = useMemo(() => {
		const filtered = [...documents].filter(documentMatchesCategoryFilter);
		filtered.sort((a, b) => compareDocumentsForSort(a, b, sortOption));
		return filtered;
	}, [documents, documentMatchesCategoryFilter, sortOption]);

	/** 상태 필터 ≠ 전체: 복사본 기준 모드(원문 전부 펼침, 복사본 행만 필터) */
	const isCopyFilterMode = selectedStatuses.length > 0;

	const copyFilterSourceIdsKey = useMemo(() => {
		if (!isCopyFilterMode) return "";
		return categoryFilteredAndSortedDocuments
			.map((d) => d.id)
			.sort((a, b) => a - b)
			.join(",");
	}, [isCopyFilterMode, categoryFilteredAndSortedDocuments]);

	/** 상태 필터 사용 시 복사본 전체 목록이 필요해 id별로 로드 */
	useEffect(() => {
		if (!isCopyFilterMode || !copyFilterSourceIdsKey) return;
		const ids = copyFilterSourceIdsKey
			.split(",")
			.map((s) => Number.parseInt(s, 10))
			.filter((n) => !Number.isNaN(n));
		let cancelled = false;
		for (const sourceId of ids) {
			if (copiesBySourceIdRef.current.has(sourceId)) continue;
			(async () => {
				try {
					const raw = await documentApi.getCopiesBySourceId(sourceId);
					if (cancelled) return;
					const items = mapCopiesResponseToListItems(raw);
					setCopiesBySourceId((prev) => {
						if (prev.has(sourceId)) return prev;
						const next = new Map(prev);
						next.set(sourceId, items);
						return next;
					});
				} catch {
					if (cancelled) return;
					setCopiesBySourceId((prev) => {
						if (prev.has(sourceId)) return prev;
						const next = new Map(prev);
						next.set(sourceId, []);
						return next;
					});
				}
			})();
		}
		return () => {
			cancelled = true;
		};
	}, [isCopyFilterMode, copyFilterSourceIdsKey, mapCopiesResponseToListItems]);

	/** 복사본 기준: 복사본이 있으면 그중 하나라도 맞을 때만 원문 행 표시. 복사본 없으면 원문 status만 사용. */
	const sourcesVisibleForTable = useMemo(() => {
		const list = categoryFilteredAndSortedDocuments;
		if (!isCopyFilterMode) return list;
		return list.filter((doc) => {
			const copies = copiesBySourceId.get(doc.id);
			if (copies == null) return false;
			if (copies.length === 0)
				return documentMatchesStatusFilter(doc.status, selectedStatuses);
			return copies.some((c) =>
				documentMatchesStatusFilter(c.status, selectedStatuses),
			);
		});
	}, [
		categoryFilteredAndSortedDocuments,
		selectedStatuses,
		copiesBySourceId,
		isCopyFilterMode,
	]);

	const copyFilterPrefetchDone = useMemo(() => {
		if (!isCopyFilterMode) return true;
		if (categoryFilteredAndSortedDocuments.length === 0) return true;
		return categoryFilteredAndSortedDocuments.every((d) =>
			copiesBySourceId.has(d.id),
		);
	}, [isCopyFilterMode, categoryFilteredAndSortedDocuments, copiesBySourceId]);

	const tableData: RowItem[] = useMemo(() => {
		const rows: RowItem[] = [];
		for (const item of sourcesVisibleForTable) {
			rows.push({ ...item, isCopyRow: false });
			const rowExpanded = isCopyFilterMode
				? true
				: expandedSourceIds.has(item.id);
			if (rowExpanded) {
				const copies = copiesBySourceId.get(item.id); // 로딩 중이면 아직 키가 없어 undefined
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
						const copiesFiltered =
							selectedStatuses.length === 0
								? copies
								: copies.filter((c) =>
										documentMatchesStatusFilter(c.status, selectedStatuses),
									);
						if (copiesFiltered.length === 0) {
							rows.push({
								id: -item.id - 1000000,
								title: "선택한 상태에 해당하는 복사본이 없습니다.",
								isCopyRow: true,
								sourceDocumentId: item.id,
								isLoadingRow: true,
								rowNumber: 1,
							} as RowItem);
						} else {
							const sortedCopies = [...copiesFiltered].sort((a, b) =>
								compareDocumentsForSort(a, b, sortOption),
							);
							sortedCopies.forEach((copy, idx) => {
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
		}
		return rows;
	}, [
		sourcesVisibleForTable,
		expandedSourceIds,
		copiesBySourceId,
		loadingCopySourceIds,
		selectedStatuses,
		isCopyFilterMode,
		sortOption,
	]);

	const toggleSourceExpand = useCallback(
		async (sourceId: number) => {
			if (selectedStatuses.length > 0) return;
			const isCurrentlyExpanded = expandedSourceIds.has(sourceId);
			if (isCurrentlyExpanded) {
				setExpandedSourceIds((prev) => {
					const next = new Set(prev);
					next.delete(sourceId);
					return next;
				});
				return;
			}
			// 펼치자마자 확장하고, 복사본(이 문서를 수정하고 있는 사람들의 문서) 로드
			setExpandedSourceIds((prev) => new Set(prev).add(sourceId));
			if (!copiesBySourceId.has(sourceId)) {
				setLoadingCopySourceIds((prev) => new Set(prev).add(sourceId));
				try {
					const copies = await documentApi.getCopiesBySourceId(sourceId);
					const withMeta = mapCopiesResponseToListItems(copies);
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
		[
			expandedSourceIds,
			copiesBySourceId,
			mapCopiesResponseToListItems,
			selectedStatuses,
		],
	);

	const handleStartTranslation = async (doc: DocumentListItem) => {
		if (startTranslationLoading) return;

		if (doc.status === "APPROVED" || doc.status === "PUBLISHED") {
			const proceed = window.confirm(
				"이 문서는 이미 번역이 완료된 문서입니다. 그래도 원문 기준으로 새 번역 작업을 시작하시겠습니까?",
			);
			if (!proceed) return;
		}

		// 이미 내가 이 문서의 복사본을 가지고 있는지 확인
		try {
			const myCopy = await documentApi.getMyCopyBySourceId(doc.id);
			if (myCopy) {
				const proceed = window.confirm(
					"이미 이 문서의 번역을 진행 중입니다. 이어하기를 사용해주세요. 그래도 새로 번역을 시작하시겠습니까?",
				);
				if (!proceed) return;
			}
		} catch (err) {
			console.warn("내 복사본 조회 실패 (번역 시작 계속 진행):", err);
		}

		setStartTranslationLoading(true);
		try {
			const res = await translationWorkApi.startTranslation(doc.id);
			navigate(`/translations/${res.id}/work`, {
				state: { from: "/translations/pending" },
			});
		} catch (err: any) {
			const msg =
				err?.response?.data?.message ||
				err?.message ||
				"번역 시작에 실패했습니다.";
			alert(msg);
		} finally {
			setStartTranslationLoading(false);
		}
	};

	const handleContinueTranslation = async (doc: DocumentListItem) => {
		if (continueTranslationLoading) return;
		setContinueTranslationLoading(true);
		try {
			const newDoc = await documentApi.copyForContinuation(doc.id);
			navigate(`/translations/${newDoc.id}/work`, {
				state: { from: "/translations/pending" },
			});
		} catch (err: any) {
			const msg =
				err?.response?.data?.message ||
				err?.message ||
				"이어서 새로 번역하기에 실패했습니다.";
			alert(msg);
		} finally {
			setContinueTranslationLoading(false);
		}
	};

	const handleViewDetail = (doc: DocumentListItem) => {
		navigate(`/documents/${doc.id}?from=pending`);
	};

	const handleToggleFavorite = async (
		doc: DocumentListItem,
		e: React.MouseEvent,
	) => {
		e.stopPropagation();
		try {
			const isFavorite = favoriteStatus.get(doc.id) || false;
			if (isFavorite) {
				await documentApi.removeFavorite(doc.id);
				setFavoriteStatus((prev) => {
					const newMap = new Map(prev);
					newMap.set(doc.id, false);
					return newMap;
				});
			} else {
				await documentApi.addFavorite(doc.id);
				setFavoriteStatus((prev) => {
					const newMap = new Map(prev);
					newMap.set(doc.id, true);
					return newMap;
				});
			}
		} catch (error) {
			console.error("찜 상태 변경 실패:", error);
			alert("찜 상태를 변경하는데 실패했습니다.");
		}
	};

	const getStatusText = (status: DocumentState) =>
		DOCUMENT_STATUS_LABELS[status] ?? String(status);

	const expandColumn: TableColumn<RowItem> = {
		key: "expand",
		label: "",
		width: "minmax(28px, 36px)",
		render: (item) => {
			if (item.isCopyRow || (item as RowItem).isLoadingRow) {
				return (
					<span style={{ display: "inline-block", width: 20, marginLeft: 8 }} />
				);
			}
			const expanded =
				selectedStatuses.length > 0 ? true : expandedSourceIds.has(item.id);
			const loading = loadingCopySourceIds.has(item.id);
			const copies = copiesBySourceId.get(item.id);
			const count =
				selectedStatuses.length > 0 && copies
					? copies.filter((c) =>
							documentMatchesStatusFilter(c.status, selectedStatuses),
						).length
					: (copies?.length ?? 0);
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

	/** 번역 작업 화면에서 이어하기 세션이 붙은 복사본 행에만 뱃지 (다른 복사본/원문 행에는 미표시) */
	const renderAdminSessionBadge = (row: RowItem) => {
		if (row.isLoadingRow || !row.adminTranslationSessionActive) return null;
		const sessionCopyId = row.adminSessionCopyDocumentId;
		if (sessionCopyId == null) return null;
		if (!row.isCopyRow || Number(row.id) !== Number(sessionCopyId)) return null;
		const name = row.adminSessionUser?.name;
		return (
			<span
				title={name ? `관리자 번역 세션 · ${name}` : "관리자 번역 세션"}
				style={{
					display: "inline-block",
					padding: "2px 5px",
					borderRadius: "4px",
					fontSize: "10px",
					fontWeight: 500,
					backgroundColor: "#FFF3E0",
					color: "#E65100",
				}}
			>
				{name ? `관리자 번역 중 · ${name}` : "관리자 번역 중"}
			</span>
		);
	};

	const nColumn: TableColumn<RowItem> = {
		key: "createdAtOrder",
		label: "N",
		sortKey: "createdAt",
		width: "minmax(2.25rem, max-content)",
		align: "center",
		render: (item) => {
			const row = item as RowItem;
			if (row.isLoadingRow) {
				return (
					<span style={{ fontSize: "12px", color: colors.secondaryText }}>
						…
					</span>
				);
			}
			if (row.isCopyRow) {
				return (
					<span style={{ fontSize: "12px", color: colors.secondaryText }} />
				);
			}
			const n = createdAtRankBySourceId.get(item.id);
			return (
				<span
					style={{
						fontSize: "12px",
						color: colors.primaryText,
						fontWeight: 600,
					}}
					title="문서 생성일 기준 순번"
				>
					{n != null ? n : "—"}
				</span>
			);
		},
	};

	const numberColumn: TableColumn<RowItem> = {
		key: "rowNumber",
		label: "인원",
		width: "minmax(2.5rem, max-content)",
		align: "center",
		render: (item) => {
			const row = item as RowItem;
			if (row.isLoadingRow) {
				return (
					<span style={{ fontSize: "12px", color: colors.secondaryText }}>
						…
					</span>
				);
			}
			if (row.isCopyRow) {
				return (
					<span style={{ fontSize: "12px", color: colors.secondaryText }} />
				);
			}
			const working = inTranslationCountBySourceId.get(item.id);
			if (working === undefined) {
				return (
					<span style={{ fontSize: "12px", color: colors.secondaryText }}>
						…
					</span>
				);
			}
			return (
				<span
					style={{
						fontSize: "12px",
						color: colors.primaryText,
						fontWeight: 600,
					}}
					title="번역 중(IN_TRANSLATION)인 복사본 수"
				>
					{working}
				</span>
			);
		},
	};

	const handleColumnSort = useCallback((sortKey: string) => {
		setSortOption((prev) => {
			if (prev.field === sortKey) {
				return {
					field: prev.field,
					order: prev.order === "asc" ? "desc" : "asc",
				};
			}
			if (sortKey === "createdAt") {
				return { field: "createdAt", order: "asc" };
			}
			return { field: sortKey as DocumentSortOption["field"], order: "asc" };
		});
	}, []);

	const columns: TableColumn<RowItem>[] = [
		nColumn,
		numberColumn,
		expandColumn,
		{
			key: "title",
			label: "문서 제목",
			sortKey: "title",
			width: "minmax(2.5rem, 1fr)",
			render: (item) => {
				const isFavorite = favoriteStatus.get(item.id) || false;
				return (
					<div
						style={{
							display: "flex",
							alignItems: "flex-start",
							gap: "3px",
							paddingLeft: item.isCopyRow ? 18 : 0,
							minWidth: 0,
							width: "100%",
							overflow: "hidden",
						}}
					>
						{!item.isCopyRow && (
							<button
								type="button"
								className="lb-fav-star-btn"
								onClick={(e) => handleToggleFavorite(item, e)}
								aria-label={isFavorite ? "찜 해제" : "찜 추가"}
								style={{
									background: "none",
									border: "none",
									cursor: "pointer",
									padding: 0,
									margin: 0,
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
									width: 22,
									height: 22,
									flexShrink: 0,
									color: isFavorite ? "#E6B800" : "#B0B0B0",
									transition: "color 0.15s ease",
									borderRadius: "4px",
									outline: "none",
									boxShadow: "none",
								}}
								title={isFavorite ? "찜 해제" : "찜 추가"}
							>
								<Star
									size={13}
									strokeWidth={isFavorite ? 0 : 1.75}
									fill={isFavorite ? "currentColor" : "none"}
									aria-hidden
								/>
							</button>
						)}
						<span
							style={{
								fontWeight: item.isCopyRow ? 400 : 500,
								color: "#000000",
								fontSize: "12px",
								minWidth: 0,
								whiteSpace: "normal",
								overflow: "hidden",
								display: "-webkit-box",
								WebkitLineClamp: 2,
								WebkitBoxOrient: "vertical" as const,
								lineHeight: 1.28,
								wordBreak: "break-word",
							}}
							title={item.title}
						>
							{item.title}
						</span>
						{item.isCopyRow && !(item as RowItem).isLoadingRow && (
							<span
								style={{
									fontSize: "10px",
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
			key: "status",
			label: "상태",
			width: "minmax(3.75rem, max-content)",
			render: (item) => {
				const row = item as RowItem;
				if (row.isLoadingRow)
					return (
						<span style={{ color: colors.secondaryText, fontSize: "12px" }}>
							-
						</span>
					);
				const wrapStatus = (inner: React.ReactNode) => (
					<div
						style={{
							display: "flex",
							flexWrap: "wrap",
							gap: "3px",
							alignItems: "center",
						}}
					>
						{inner}
						{renderAdminSessionBadge(row)}
					</div>
				);
				if (!item.isCopyRow) {
					return wrapStatus(
						<span
							style={{
								display: "inline-block",
								padding: "2px 5px",
								borderRadius: "4px",
								fontSize: "10px",
								fontWeight: 500,
								backgroundColor: "#E8E6F0",
								color: "#5B5694",
							}}
						>
							원문
						</span>,
					);
				}
				if (row.hasHandoverRequest) {
					return wrapStatus(
						<span
							style={{
								display: "inline-block",
								padding: "2px 5px",
								borderRadius: "4px",
								fontSize: "10px",
								fontWeight: 500,
								backgroundColor: "#E8F0E8",
								color: "#2E7D32",
							}}
						>
							인계 요청
						</span>,
					);
				}
				return wrapStatus(<StatusBadge status={item.status} compact />);
			},
		},
		{
			key: "category",
			label: "카테고리",
			width: "minmax(4.25rem, max-content)",
			render: (item) => (
				<span
					style={{
						color: colors.primaryText,
						fontSize: "11px",
						display: "block",
						minWidth: 0,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
					title={
						(item as RowItem).isLoadingRow ? undefined : (item.category ?? "-")
					}
				>
					{(item as RowItem).isLoadingRow ? "-" : (item.category ?? "-")}
				</span>
			),
		},
		{
			key: "estimatedLength",
			label: "예상 분량",
			sortKey: "estimatedLength",
			width: "minmax(4.75rem, max-content)",
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
			key: "lastModified",
			label: "최근 수정",
			sortKey: "lastModified",
			width: "minmax(9rem, max-content)",
			align: "right",
			render: (item) => (
				<span style={{ color: colors.primaryText, fontSize: "12px" }}>
					{(item as RowItem).isLoadingRow ? "-" : item.lastModified || "-"}
				</span>
			),
		},
		{
			key: "currentWorker",
			label: "작업자",
			width: "minmax(3.75rem, max-content)",
			render: (item) => {
				if (!item.isCopyRow || (item as RowItem).isLoadingRow)
					return (
						<span style={{ color: colors.secondaryText, fontSize: "12px" }}>
							-
						</span>
					);
				return (
					<span
						style={{
							color:
								item.status === "IN_TRANSLATION"
									? "#FF6B00"
									: colors.primaryText,
							fontSize: "12px",
							fontWeight: item.status === "IN_TRANSLATION" ? 500 : 400,
						}}
					>
						{item.currentWorker || "-"}
					</span>
				);
			},
		},
		{
			key: "currentVersion",
			label: "현재 버전",
			width: "minmax(3.5rem, max-content)",
			align: "right",
			render: (item) => {
				if ((item as RowItem).isLoadingRow)
					return (
						<span style={{ color: colors.secondaryText, fontSize: "12px" }}>
							-
						</span>
					);
				if (!item.isCopyRow) {
					return (
						<span
							style={{ color: colors.primaryText, fontSize: "12px" }}
							title="초벌 기준 v1부터 시작합니다. 누군가 번역 작업을 하면 v2부터 쌓입니다."
						>
							v1
						</span>
					);
				}
				return (
					<span style={{ color: colors.primaryText, fontSize: "12px" }}>
						{formatTranslationListVersionLabel(
							item.isFinal,
							item.currentVersionNumber ?? null,
							item.userFacingVersionNumber,
						)}
					</span>
				);
			},
		},
		{
			key: "action",
			label: "액션",
			width: "minmax(13rem, max-content)",
			align: "right",
			render: (item) => {
				if ((item as RowItem).isLoadingRow)
					return (
						<span style={{ color: colors.secondaryText, fontSize: "12px" }}>
							-
						</span>
					);
				// 원문 행: 화면 기준 v1(초벌)부터. 복사본은 수동 저장 시 v2부터 순차 증가.
				const row = item as RowItem;
				const isSourceRow = !item.isCopyRow && !row.isLoadingRow;
				const activeCopyId = row.adminSessionCopyDocumentId ?? null;
				const hasInAppSession =
					!!row.adminTranslationSessionActive && activeCopyId != null;
				const uid = user?.id != null ? Number(user.id) : Number.NaN;
				const sessionOwnerId =
					row.adminSessionUser?.id != null
						? Number(row.adminSessionUser.id)
						: Number.NaN;
				const isSessionOwner =
					hasInAppSession &&
					!Number.isNaN(uid) &&
					!Number.isNaN(sessionOwnerId) &&
					uid === sessionOwnerId;
				/** 세션이 특정 복사본에만 걸려 있을 때: 원문은 번역 시작만, 해당 복사본 행만 이어하기 등 잠금 */
				const adminEditLocked =
					hasInAppSession &&
					!isSessionOwner &&
					(isSourceRow ||
						(item.isCopyRow && Number(row.id) === Number(activeCopyId)));
				const showStartBtn = isSourceRow && !adminEditLocked;
				const isMyCopy =
					item.isCopyRow && Number(row.createdById) === Number(user?.id);
				const hasHandoverRequest = !!row.hasHandoverRequest;
				const showResumeBtn = isMyCopy && !adminEditLocked;
				const showHandoverContinueBtn =
					item.isCopyRow && !isMyCopy && hasHandoverRequest && !adminEditLocked;
				const showContinueBtn =
					item.isCopyRow &&
					isAdmin &&
					!isMyCopy &&
					!hasHandoverRequest &&
					!adminEditLocked;

				return (
					<div
						style={{
							display: "flex",
							gap: "6px",
							alignItems: "center",
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
						{showStartBtn && (
							<Button
								variant="primary"
								onClick={(e) => {
									if (e) e.stopPropagation();
									handleStartTranslation(item);
								}}
								style={{ fontSize: "12px", padding: "6px 12px" }}
							>
								번역 시작
							</Button>
						)}
						{showResumeBtn && (
							<Button
								variant="primary"
								onClick={(e) => {
									if (e) e.stopPropagation();
									navigate(`/translations/${item.id}/work`, {
										state: { from: "/translations/pending" },
									});
								}}
								style={{ fontSize: "12px", padding: "6px 12px" }}
							>
								이어하기
							</Button>
						)}
						{showHandoverContinueBtn && (
							<Button
								variant="primary"
								onClick={(e) => {
									if (e) e.stopPropagation();
									handleContinueTranslation(item);
								}}
								style={{ fontSize: "12px", padding: "6px 12px" }}
							>
								이어받기
							</Button>
						)}
						{showContinueBtn && (
							<Button
								variant="secondary"
								onClick={(e) => {
									if (e) e.stopPropagation();
									navigate(`/translations/${item.id}/work`, {
										state: { from: "/translations/pending" },
									});
								}}
								style={{ fontSize: "12px", padding: "6px 12px" }}
							>
								이어서 번역하기
							</Button>
						)}
					</div>
				);
			},
		},
	];

	return (
		<div
			style={{
				padding: "1.25% 2%",
				backgroundColor: colors.primaryBackground,
				minHeight: "100vh",
				width: "100%",
				maxWidth: "100%",
				minWidth: 0,
				boxSizing: "border-box",
			}}
		>
			<style>{`
        .lb-fav-star-btn {
          -webkit-tap-highlight-color: transparent;
          overflow: hidden;
        }
        .lb-fav-star-btn:focus,
        .lb-fav-star-btn:focus-visible {
          outline: none;
          box-shadow: none;
        }
      `}</style>
			<div
				style={{
					width: "100%",
					maxWidth: "100%",
					minWidth: 0,
					marginLeft: "auto",
					marginRight: "auto",
					boxSizing: "border-box",
				}}
			>
				<h1
					style={{
						fontSize: "clamp(1.1rem, 1.35vw, 1.35rem)",
						fontWeight: 600,
						color: "#000000",
						marginBottom: "1.25%",
					}}
				>
					번역 대기 문서
				</h1>
				<div
					style={{
						fontSize: "clamp(0.8rem, 0.95vw, 0.875rem)",
						color: colors.secondaryText,
						marginBottom: "1.25%",
						padding: "1% 1.25%",
						backgroundColor: "#F8F9FA",
						borderRadius: "4px",
					}}
				>
					초안·번역 중·완료 문서를 모두 확인할 수 있습니다. 초안 상태 문서에서
					번역을 시작할 수 있으며, 상세보기로 문서 내용을 확인할 수 있습니다.
				</div>

				{/* 필터: 1행 = 왼쪽 카테고리(스크롤) · 오른쪽 상태(고정) | 2행 = 소분류 */}
				<div
					style={{
						backgroundColor: colors.surface,
						border: `1px solid ${colors.border}`,
						borderRadius: "8px",
						padding: "1% 1.25%",
						marginBottom: "1.25%",
						display: "flex",
						flexDirection: "column",
						gap: "10px",
						minWidth: 0,
						width: "100%",
						boxSizing: "border-box",
					}}
				>
					<div
						style={{
							width: "100%",
							minWidth: 0,
							overflowX: "auto",
							overflowY: "hidden",
							WebkitOverflowScrolling: "touch",
							scrollbarWidth: "thin",
						}}
					>
						<div
							style={{
								display: "flex",
								flexDirection: "row",
								alignItems: "center",
								width: "100%",
								minWidth: 0,
								gap: 0,
							}}
						>
							{/* 왼쪽: 카테고리 — 남는 폭만 쓰고 칩은 가로 스크롤 */}
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "8px",
									flex: "1 1 0",
									minWidth: 0,
								}}
							>
								<span
									style={{
										fontSize: "11px",
										fontWeight: 600,
										color: colors.secondaryText,
										flexShrink: 0,
										whiteSpace: "nowrap",
									}}
								>
									카테고리
								</span>
								<div
									style={{
										flex: "1 1 0",
										minWidth: 0,
										overflowX: "auto",
										overflowY: "hidden",
										WebkitOverflowScrolling: "touch",
										scrollbarWidth: "thin",
										paddingBottom: "2px",
									}}
								>
									<div
										role="tablist"
										aria-label="카테고리 대분류"
										style={{
											display: "inline-flex",
											gap: "5px",
											flexWrap: "nowrap",
											padding: "1px 0",
										}}
									>
										<button
											type="button"
											role="tab"
											aria-selected={selectedCategoryMajor === "전체"}
											onClick={() => {
												setSelectedCategoryMajor("전체");
												setSelectedCategoryMinor("전체");
											}}
											style={{
												padding: "4px 9px",
												fontSize: "12px",
												borderRadius: "999px",
												cursor: "pointer",
												fontWeight:
													selectedCategoryMajor === "전체" ? 600 : 500,
												fontFamily: "system-ui, Pretendard, sans-serif",
												border:
													selectedCategoryMajor === "전체"
														? "1px solid #374151"
														: `1px solid ${colors.border}`,
												backgroundColor:
													selectedCategoryMajor === "전체"
														? "#374151"
														: colors.surface,
												color:
													selectedCategoryMajor === "전체"
														? "#FFFFFF"
														: colors.primaryText,
												flexShrink: 0,
												whiteSpace: "nowrap",
												lineHeight: 1.2,
											}}
										>
											전체
										</button>
										{categoryMajorOptions.map((major) => {
											const on = selectedCategoryMajor === major;
											return (
												<button
													key={major}
													type="button"
													role="tab"
													aria-selected={on}
													onClick={() => {
														setSelectedCategoryMajor(major);
														setSelectedCategoryMinor("전체");
													}}
													style={{
														padding: "4px 9px",
														fontSize: "12px",
														borderRadius: "999px",
														cursor: "pointer",
														fontWeight: on ? 600 : 500,
														fontFamily: "system-ui, Pretendard, sans-serif",
														border: on
															? "1px solid #4b5563"
															: `1px solid ${colors.border}`,
														backgroundColor: on ? "#E5E7EB" : colors.surface,
														color: on ? "#111827" : colors.primaryText,
														flexShrink: 0,
														whiteSpace: "nowrap",
														lineHeight: 1.2,
													}}
												>
													{major}
												</button>
											);
										})}
									</div>
								</div>
							</div>

							{/* 오른쪽: 구분선 + 상태 — 카테고리와 띄워서 우측 정렬 */}
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "10px",
									flexShrink: 0,
									marginLeft: "2.5%",
									paddingLeft: "1.5%",
									borderLeft: `1px solid ${colors.border}`,
								}}
							>
								<span
									style={{
										fontSize: "11px",
										fontWeight: 600,
										color: colors.secondaryText,
										flexShrink: 0,
										whiteSpace: "nowrap",
									}}
								>
									상태
								</span>
								<div
									role="group"
									aria-label="문서 상태 필터 (다중 선택)"
									style={{
										display: "flex",
										gap: "5px",
										flexWrap: "nowrap",
										alignItems: "center",
										flexShrink: 0,
									}}
								>
									<button
										type="button"
										onClick={() => setSelectedStatuses([])}
										title="모든 상태 표시"
										style={{
											padding: "4px 10px",
											fontSize: "12px",
											borderRadius: "999px",
											cursor: "pointer",
											fontWeight: selectedStatuses.length === 0 ? 600 : 400,
											fontFamily: "system-ui, Pretendard, sans-serif",
											border:
												selectedStatuses.length === 0
													? "1px solid #696969"
													: `1px solid ${colors.border}`,
											backgroundColor:
												selectedStatuses.length === 0
													? "#696969"
													: colors.surface,
											color:
												selectedStatuses.length === 0
													? "#FFFFFF"
													: colors.primaryText,
											flexShrink: 0,
											whiteSpace: "nowrap",
											lineHeight: 1.2,
										}}
									>
										전체
									</button>
									{DOCUMENT_STATUS_ORDER.map((st) => {
										const on = selectedStatuses.includes(st);
										const stStyle = DOCUMENT_STATUS_STYLES[st];
										return (
											<button
												key={st}
												type="button"
												onClick={() => toggleStatusFilter(st)}
												title={on ? "선택 해제" : "선택 추가"}
												style={{
													padding: "4px 10px",
													fontSize: "12px",
													borderRadius: "999px",
													cursor: "pointer",
													fontWeight: on ? 600 : 500,
													fontFamily: "system-ui, Pretendard, sans-serif",
													border: on
														? `1px solid ${stStyle.text}`
														: `1px solid ${colors.border}`,
													backgroundColor: on ? stStyle.bg : colors.surface,
													color: stStyle.text,
													opacity: on ? 1 : 0.85,
													boxShadow: on
														? `inset 0 0 0 1px ${stStyle.text}40`
														: undefined,
													flexShrink: 0,
													whiteSpace: "nowrap",
													lineHeight: 1.2,
												}}
											>
												{DOCUMENT_STATUS_LABELS[st]}
											</button>
										);
									})}
								</div>
							</div>
						</div>
					</div>
					{selectedCategoryMajor !== "전체" &&
						categoryMinorOptions.length > 0 && (
							<div
								style={{
									display: "flex",
									alignItems: "flex-start",
									gap: "8px",
									width: "100%",
									minWidth: 0,
								}}
							>
								<span
									style={{
										fontSize: "11px",
										fontWeight: 600,
										flexShrink: 0,
										whiteSpace: "nowrap",
										visibility: "hidden",
										userSelect: "none",
									}}
									aria-hidden
								>
									카테고리
								</span>
								<div
									style={{
										display: "flex",
										flexDirection: "column",
										gap: "6px",
										flex: 1,
										minWidth: 0,
									}}
								>
									<span
										style={{
											fontSize: "11px",
											fontWeight: 600,
											color: colors.secondaryText,
										}}
									>
										소분류
									</span>
									<div
										role="group"
										aria-label="카테고리 소분류"
										style={{
											display: "flex",
											flexWrap: "wrap",
											gap: "6px",
											alignItems: "center",
										}}
									>
										<button
											type="button"
											onClick={() => setSelectedCategoryMinor("전체")}
											style={{
												padding: "4px 9px",
												fontSize: "11px",
												borderRadius: "8px",
												cursor: "pointer",
												fontWeight:
													selectedCategoryMinor === "전체" ? 600 : 500,
												fontFamily: "system-ui, Pretendard, sans-serif",
												border:
													selectedCategoryMinor === "전체"
														? "1px solid #6b7280"
														: `1px solid ${colors.border}`,
												backgroundColor:
													selectedCategoryMinor === "전체"
														? "#F3F4F6"
														: colors.surface,
												color: "#111827",
												lineHeight: 1.2,
											}}
										>
											전체
										</button>
										{categoryMinorOptions.map((minor) => {
											const on = selectedCategoryMinor === minor;
											return (
												<button
													key={minor}
													type="button"
													onClick={() => setSelectedCategoryMinor(minor)}
													style={{
														padding: "4px 9px",
														fontSize: "11px",
														borderRadius: "8px",
														cursor: "pointer",
														fontWeight: on ? 600 : 500,
														fontFamily: "system-ui, Pretendard, sans-serif",
														border: on
															? "1px solid #2563eb"
															: `1px solid ${colors.border}`,
														backgroundColor: on ? "#EFF6FF" : colors.surface,
														color: on ? "#1d4ed8" : colors.primaryText,
														lineHeight: 1.2,
													}}
												>
													{minor}
												</button>
											);
										})}
									</div>
								</div>
							</div>
						)}
				</div>

				{/* 에러 메시지 */}
				{error && (
					<div
						style={{
							padding: "1.25% 1.5%",
							marginBottom: "1.25%",
							backgroundColor: "#F5F5F5",
							border: `1px solid ${colors.border}`,
							borderRadius: "8px",
							color: colors.primaryText,
							fontSize: "clamp(0.8rem, 0.95vw, 0.875rem)",
						}}
					>
						⚠️ {error}
					</div>
				)}

				{/* 테이블 */}
				{loading ||
				(isCopyFilterMode &&
					!copyFilterPrefetchDone &&
					categoryFilteredAndSortedDocuments.length > 0) ? (
					<div
						style={{
							padding: "4% 2%",
							textAlign: "center",
							color: colors.primaryText,
							fontSize: "clamp(0.8rem, 0.95vw, 0.875rem)",
						}}
					>
						{loading ? "로딩 중..." : "복사본 목록을 불러오는 중…"}
					</div>
				) : (
					<Table
						columnGap="0.1rem"
						columns={columns}
						data={tableData}
						onRowClick={(item) => {
							if ((item as RowItem).isLoadingRow) return;
							if (item.isCopyRow) {
								handleViewDetail(item);
							} else if (!isCopyFilterMode) {
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
							if (isCopyFilterMode || expandedSourceIds.has(row.id)) {
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
						emptyMessage="표시할 문서가 없습니다. 새 번역 등록에서 문서를 생성하거나, 기존 문서의 상태를 초안으로 맞춰 주세요."
						sortField={sortOption.field}
						sortOrder={sortOption.order}
						onColumnSort={handleColumnSort}
						plainRowStyle
					/>
				)}
			</div>
		</div>
	);
}
