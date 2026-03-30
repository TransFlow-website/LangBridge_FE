import {
	useState,
	useMemo,
	useEffect,
	useCallback,
	useRef,
	type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Table, type TableColumn } from "../components/Table";
import {
	type DocumentListItem,
	Priority,
	type DocumentSortOption,
} from "../types/document";
import { DocumentState } from "../types/translation";
import { colors } from "../constants/designTokens";
import { Button } from "../components/Button";
import {
	documentApi,
	type DocumentResponse,
	type DocumentVersionResponse,
} from "../services/documentApi";
import { categoryApi } from "../services/categoryApi";
import { useUser } from "../contexts/UserContext";
import {
	translationWorkApi,
	type LockStatusResponse,
} from "../services/translationWorkApi";
import { UserRole } from "../types/user";
import { formatLastModifiedDate } from "../utils/dateUtils";
import { formatTranslationListVersionLabel } from "../utils/versionDisplay";
import { StatusBadge } from "../components/StatusBadge";
import {
	DOCUMENT_STATUS_LABELS,
	DOCUMENT_STATUS_ORDER,
	DOCUMENT_STATUS_STYLES,
} from "../constants/documentStatusLabels";
import {
	minorNamesForMajor,
	splitCategoryName,
	uniqueSortedMajorNames,
} from "../utils/categoryHierarchy";
import { useMyInTranslationBySourceId } from "../hooks/useMyInTranslationBySourceId";

/** 내가 작업 중: 초안(PENDING_TRANSLATION) 필터 칩 제외 — 목록에도 해당 상태 없음 */
const WORKING_PAGE_STATUS_FILTER_ORDER = DOCUMENT_STATUS_ORDER.filter(
	(st) => st !== DocumentState.PENDING_TRANSLATION,
);

/** 내가 시작한 복사본 중, 목록에 보여 줄 상태 (번역 중 ~ 게시까지) */
const MY_ASSIGNMENT_STATUSES = new Set<string>([
	"IN_TRANSLATION",
	"PENDING_REVIEW",
	"APPROVED",
	"PUBLISHED",
]);

/** 번역 중: 복사본 생성자 또는 최근 수정자가 나인 경우(관리자가 만든 복사본을 내가 이어하는 경우 포함). 그 외 단계는 내가 시작한 복사본만 */
function isMyWorkingAssignment(doc: DocumentResponse, myId: number): boolean {
	if (!MY_ASSIGNMENT_STATUSES.has(doc.status)) return false;
	if (doc.status === "IN_TRANSLATION") {
		return (
			Number(doc.createdBy?.id) === Number(myId) ||
			Number(doc.lastModifiedBy?.id) === Number(myId)
		);
	}
	return Number(doc.createdBy?.id) === Number(myId);
}

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
		createdAt: doc.createdAt,
		assignedManager: doc.lastModifiedBy?.name,
		isFinal: !!(doc as DocumentResponse).currentVersionIsFinal,
		originalUrl: doc.originalUrl,
		currentWorker:
			doc.status === "IN_TRANSLATION"
				? (doc.lastModifiedBy?.name ?? doc.createdBy?.name)
				: (doc.createdBy?.name ?? lockStatus?.lockedBy?.name),
		currentVersionNumber: currentVersionNumber ?? undefined,
		userFacingVersionNumber: userFacingVersionNumber ?? undefined,
		isMyLock: true,
		sourceDocumentId: doc.sourceDocumentId ?? undefined,
		adminTranslationSessionActive: doc.adminTranslationSessionActive,
		adminSessionCopyDocumentId: doc.adminSessionCopyDocumentId,
		adminSessionUser: doc.adminSessionUser
			? {
					id: doc.adminSessionUser.id,
					name: doc.adminSessionUser.name,
					email: doc.adminSessionUser.email,
				}
			: undefined,
	};
	return item;
};

/** 번역 대기 목록과 동일한 복사본 행 변환(진행률·원문 버전 없이 목록용) */
function pendingStyleListItemFromResponse(
	doc: DocumentResponse,
	categoryMap: Map<number, string>,
): DocumentListItem {
	let progress = 0;
	if (doc.status === "APPROVED") {
		progress = 100;
	} else if (doc.status === "IN_TRANSLATION") {
		progress = 0;
	}
	const createdAt = new Date(doc.createdAt);
	const now = new Date();
	const diffDays = Math.ceil(
		(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000 - now.getTime()) /
			(1000 * 60 * 60 * 24),
	);
	const deadline = diffDays > 0 ? `${diffDays}일 후` : "마감됨";
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
		priority: Priority.MEDIUM,
		status: doc.status as DocumentState,
		lastModified: doc.updatedAt
			? formatLastModifiedDate(doc.updatedAt)
			: undefined,
		createdAt: doc.createdAt,
		assignedManager: doc.lastModifiedBy?.name,
		isFinal: !!doc.currentVersionIsFinal,
		originalUrl: doc.originalUrl,
	};
}

type WorkingRowItem = DocumentListItem & {
	isCopyRow?: boolean;
	isLoadingRow?: boolean;
	createdById?: number;
	hasHandoverRequest?: boolean;
	rowNumber?: number;
};

export default function TranslationsWorking() {
	const navigate = useNavigate();
	const { user } = useUser();
	const isAdmin =
		user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN;
	const [sourceDocuments, setSourceDocuments] = useState<DocumentListItem[]>(
		[],
	);
	/** 내가 작업 중인 복사본 id (이어하기·액션용) */
	const [workingCopyIds, setWorkingCopyIds] = useState<Set<number>>(
		() => new Set(),
	);
	const [copiesBySourceId, setCopiesBySourceId] = useState<
		Map<number, WorkingRowItem[]>
	>(() => new Map());
	const [expandedSourceIds, setExpandedSourceIds] = useState<Set<number>>(
		() => new Set(),
	);
	const [loadingCopySourceIds, setLoadingCopySourceIds] = useState<Set<number>>(
		() => new Set(),
	);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedCategoryMajor, setSelectedCategoryMajor] =
		useState<string>("전체");
	const [selectedCategoryMinor, setSelectedCategoryMinor] =
		useState<string>("전체");
	const [categoryMap, setCategoryMap] = useState<Map<number, string>>(
		new Map(),
	);
	const [sortOption, setSortOption] = useState<DocumentSortOption>({
		field: "createdAt",
		order: "asc",
	});
	const [selectedStatuses, setSelectedStatuses] = useState<DocumentState[]>([]);
	const [inTranslationCountBySourceId, setInTranslationCountBySourceId] =
		useState<Map<number, number>>(() => new Map());
	const [startTranslationLoading, setStartTranslationLoading] = useState(false);
	const [continueTranslationLoading, setContinueTranslationLoading] =
		useState(false);

	const myInTranslationBySourceId = useMyInTranslationBySourceId(
		sourceDocuments,
		user?.id,
	);

	const copiesBySourceIdRef = useRef<Map<number, WorkingRowItem[]>>(new Map());

	// 예전에 초안 필터가 저장돼 있으면 제거
	useEffect(() => {
		setSelectedStatuses((prev) =>
			prev.filter((s) => s !== DocumentState.PENDING_TRANSLATION),
		);
	}, []);

	// 카테고리 맵 (번역 대기 문서 페이지와 동일)
	useEffect(() => {
		const loadCategories = async () => {
			try {
				const categoryList = await categoryApi.getAllCategories();
				const map = new Map<number, string>();
				for (const cat of categoryList) {
					map.set(cat.id, cat.name);
				}
				setCategoryMap(map);
			} catch (e) {
				console.error("카테고리 목록 로드 실패:", e);
			}
		};
		loadCategories();
	}, []);

	const enrichSourceDocument = useCallback(
		async (doc: DocumentResponse, map: Map<number, string>) => {
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
			} catch {
				// ignore
			}
			const lockStatus: LockStatusResponse = {
				locked: false,
				canEdit: true,
				completedParagraphs: doc.completedParagraphs ?? [],
			};
			return convertToDocumentListItem(
				doc,
				map,
				lockStatus,
				originalVersion,
				currentVersionNumber,
				userFacingVersionNumber,
			);
		},
		[],
	);

	const mapCopiesResponseToListItems = useCallback(
		(docs: DocumentResponse[]): WorkingRowItem[] => {
			return docs.map((doc) => {
				const listItem = pendingStyleListItemFromResponse(doc, categoryMap);
				if (
					["PENDING_REVIEW", "APPROVED", "PUBLISHED"].includes(doc.status) &&
					doc.lastModifiedBy?.name
				) {
					listItem.currentWorker = doc.lastModifiedBy.name;
				} else if (doc.status === "IN_TRANSLATION" && doc.createdBy?.name) {
					listItem.currentWorker = doc.createdBy.name;
				}
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
				const row: WorkingRowItem = { ...listItem };
				if (doc.createdBy?.id != null) row.createdById = doc.createdBy.id;
				row.hasHandoverRequest = !!doc.latestHandover;
				return row;
			});
		},
		[categoryMap],
	);

	// API: 내 작업 복사본 → 원문 id 수집 → 원문·해당 원문의 모든 복사본 로드 (번역 대기 목록과 동일 트리)
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

				const [inTranslation, pendingReview, approved, published] =
					await Promise.all([
						documentApi.getAllDocuments({ status: "IN_TRANSLATION" }),
						documentApi.getAllDocuments({ status: "PENDING_REVIEW" }),
						documentApi.getAllDocuments({ status: "APPROVED" }),
						documentApi.getAllDocuments({ status: "PUBLISHED" }),
					]);
				const allDocuments = [
					...inTranslation,
					...pendingReview,
					...approved,
					...published,
				];
				const map = categoryMap;

				const myId = user?.id;
				const myWorkingDocs =
					myId != null
						? allDocuments.filter((doc) => isMyWorkingAssignment(doc, myId))
						: [];

				setWorkingCopyIds(new Set(myWorkingDocs.map((d) => d.id)));

				const uniqueSourceIds = new Set<number>();
				for (const d of myWorkingDocs) {
					if (d.sourceDocumentId != null) {
						uniqueSourceIds.add(Number(d.sourceDocumentId));
					} else {
						uniqueSourceIds.add(Number(d.id));
					}
				}

				const ids = [...uniqueSourceIds];

				const sources = await Promise.all(
					ids.map(async (sourceId) => {
						const doc = await documentApi.getDocument(sourceId);
						return enrichSourceDocument(doc, map);
					}),
				);

				const copiesArrays = await Promise.all(
					ids.map((sid) => documentApi.getCopiesBySourceId(sid)),
				);
				const nextCopies = new Map<number, WorkingRowItem[]>();
				ids.forEach((sid, i) => {
					nextCopies.set(sid, mapCopiesResponseToListItems(copiesArrays[i]));
				});

				setSourceDocuments(sources);
				setCopiesBySourceId(nextCopies);
				setExpandedSourceIds(new Set());
			} catch (err) {
				console.error("❌ 문서 목록 조회 실패:", err);
				setError(
					err instanceof Error
						? err.message
						: "문서 목록을 불러오는데 실패했습니다.",
				);
				setSourceDocuments([]);
				setCopiesBySourceId(new Map());
				setWorkingCopyIds(new Set());
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
	}, [user, categoryMap, enrichSourceDocument, mapCopiesResponseToListItems]);

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

	const documentIdsInCategory = useMemo(() => {
		const filtered = [...sourceDocuments].filter(documentMatchesCategoryFilter);
		return filtered.map((d) => d.id);
	}, [sourceDocuments, documentMatchesCategoryFilter]);

	const documentIdsKey = useMemo(
		() => [...documentIdsInCategory].sort((a, b) => a - b).join(","),
		[documentIdsInCategory],
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

	useEffect(() => {
		copiesBySourceIdRef.current = copiesBySourceId;
	}, [copiesBySourceId]);

	const categoryFilteredSortedSources = useMemo(() => {
		const filtered = [...sourceDocuments].filter(documentMatchesCategoryFilter);
		filtered.sort((a, b) => compareDocumentsForSort(a, b, sortOption));
		return filtered;
	}, [sourceDocuments, documentMatchesCategoryFilter, sortOption]);

	const createdAtRankBySourceId = useMemo(() => {
		const filtered = [...sourceDocuments].filter(documentMatchesCategoryFilter);
		filtered.sort(compareByCreatedAtThenId);
		const rankMap = new Map<number, number>();
		filtered.forEach((d, i) => rankMap.set(d.id, i + 1));
		return rankMap;
	}, [sourceDocuments, documentMatchesCategoryFilter]);

	const isCopyFilterMode = selectedStatuses.length > 0;

	const sourcesVisibleForTable = useMemo(() => {
		const list = categoryFilteredSortedSources;
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
		categoryFilteredSortedSources,
		selectedStatuses,
		copiesBySourceId,
		isCopyFilterMode,
	]);

	const copyFilterPrefetchDone = useMemo(() => {
		if (!isCopyFilterMode) return true;
		if (categoryFilteredSortedSources.length === 0) return true;
		return categoryFilteredSortedSources.every((d) =>
			copiesBySourceId.has(d.id),
		);
	}, [isCopyFilterMode, categoryFilteredSortedSources, copiesBySourceId]);

	const copyFilterSourceIdsKey = useMemo(() => {
		if (!isCopyFilterMode) return "";
		return categoryFilteredSortedSources
			.map((d) => d.id)
			.sort((a, b) => a - b)
			.join(",");
	}, [isCopyFilterMode, categoryFilteredSortedSources]);

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

	const tableData: WorkingRowItem[] = useMemo(() => {
		const rows: WorkingRowItem[] = [];
		for (const item of sourcesVisibleForTable) {
			rows.push({ ...item, isCopyRow: false });
			const rowExpanded = isCopyFilterMode
				? true
				: expandedSourceIds.has(item.id);
			if (rowExpanded) {
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
					} as WorkingRowItem);
				} else if (Array.isArray(copies)) {
					if (copies.length === 0) {
						rows.push({
							id: -item.id,
							title: "이 원문을 수정 중인 문서가 없습니다.",
							isCopyRow: true,
							sourceDocumentId: item.id,
							isLoadingRow: true,
							rowNumber: 1,
						} as WorkingRowItem);
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
							} as WorkingRowItem);
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

	const toggleStatusFilter = useCallback((st: DocumentState) => {
		setSelectedStatuses((prev) =>
			prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st],
		);
	}, []);

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

	const handleStartTranslation = async (doc: DocumentListItem) => {
		if (startTranslationLoading) return;

		if (doc.status === "APPROVED" || doc.status === "PUBLISHED") {
			const proceed = window.confirm(
				"이 문서는 이미 번역이 완료된 문서입니다. 그래도 원문 기준으로 새 번역 작업을 시작하시겠습니까?",
			);
			if (!proceed) return;
		}

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
				state: { from: "/translations/working" },
			});
		} catch (err: unknown) {
			const anyErr = err as {
				response?: { data?: { message?: string } };
				message?: string;
			};
			const msg =
				anyErr?.response?.data?.message ||
				anyErr?.message ||
				"번역 시작에 실패했습니다.";
			alert(msg);
		} finally {
			setStartTranslationLoading(false);
		}
	};

	const handleHandoverContinue = async (doc: DocumentListItem) => {
		if (continueTranslationLoading) return;
		setContinueTranslationLoading(true);
		try {
			const newDoc = await documentApi.copyForContinuation(doc.id);
			navigate(`/translations/${newDoc.id}/work`, {
				state: { from: "/translations/working" },
			});
		} catch (err: unknown) {
			const anyErr = err as {
				response?: { data?: { message?: string } };
				message?: string;
			};
			const msg =
				anyErr?.response?.data?.message ||
				anyErr?.message ||
				"이어서 새로 번역하기에 실패했습니다.";
			alert(msg);
		} finally {
			setContinueTranslationLoading(false);
		}
	};

	const handleViewDetail = (doc: DocumentListItem) => {
		navigate(`/documents/${doc.id}?from=working`);
	};

	const renderAdminSessionBadge = (row: WorkingRowItem) => {
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

	const expandColumn: TableColumn<WorkingRowItem> = {
		key: "expand",
		label: "",
		width: "minmax(28px, 36px)",
		render: (item) => {
			if (item.isCopyRow || (item as WorkingRowItem).isLoadingRow) {
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

	const nColumn: TableColumn<WorkingRowItem> = {
		key: "createdAtOrder",
		label: "N",
		sortKey: "createdAt",
		width: "minmax(2.25rem, max-content)",
		align: "center",
		render: (item) => {
			const row = item as WorkingRowItem;
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

	const numberColumn: TableColumn<WorkingRowItem> = {
		key: "rowNumber",
		label: "인원",
		width: "minmax(2.5rem, max-content)",
		align: "center",
		render: (item) => {
			const row = item as WorkingRowItem;
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

	const columns: TableColumn<WorkingRowItem>[] = [
		nColumn,
		numberColumn,
		expandColumn,
		{
			key: "title",
			label: "문서 제목",
			sortKey: "title",
			width: "minmax(2.5rem, 1fr)",
			render: (item) => (
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
					{item.isCopyRow && !(item as WorkingRowItem).isLoadingRow && (
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
			),
		},
		{
			key: "status",
			label: "상태",
			width: "minmax(3.75rem, max-content)",
			render: (item) => {
				const row = item as WorkingRowItem;
				if (row.isLoadingRow)
					return (
						<span style={{ color: colors.secondaryText, fontSize: "12px" }}>
							-
						</span>
					);
				const wrapStatus = (inner: ReactNode) => (
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
					const showMyTranslationBadge =
						myInTranslationBySourceId.get(item.id) === true;
					return wrapStatus(
						<>
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
							</span>
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
						</>,
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
						(item as WorkingRowItem).isLoadingRow
							? undefined
							: (item.category ?? "-")
					}
				>
					{(item as WorkingRowItem).isLoadingRow ? "-" : (item.category ?? "-")}
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
					{(item as WorkingRowItem).isLoadingRow
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
					{(item as WorkingRowItem).isLoadingRow
						? "-"
						: item.lastModified || "-"}
				</span>
			),
		},
		{
			key: "currentWorker",
			label: "작업자",
			width: "minmax(3.75rem, max-content)",
			render: (item) => {
				if (!item.isCopyRow || (item as WorkingRowItem).isLoadingRow)
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
				if ((item as WorkingRowItem).isLoadingRow)
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
				if ((item as WorkingRowItem).isLoadingRow)
					return (
						<span style={{ color: colors.secondaryText, fontSize: "12px" }}>
							-
						</span>
					);
				const row = item as WorkingRowItem;
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
				const adminEditLocked =
					hasInAppSession &&
					!isSessionOwner &&
					(isSourceRow ||
						(item.isCopyRow && Number(row.id) === Number(activeCopyId)));
				const showStartBtn = isSourceRow && !adminEditLocked;
				const isMyCopy =
					item.isCopyRow &&
					(workingCopyIds.has(Number(row.id)) ||
						Number(row.createdById) === Number(user?.id));
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
										state: { from: "/translations/working" },
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
									handleHandoverContinue(item);
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
										state: { from: "/translations/working" },
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
				padding: "2% 1.6%",
				backgroundColor: colors.primaryBackground,
				minHeight: "100vh",
				width: "100%",
				maxWidth: "100%",
				minWidth: 0,
				marginLeft: "auto",
				marginRight: "auto",
				boxSizing: "border-box",
			}}
		>
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
					내가 작업 중인 문서
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
					번역 중은 내가 만들었거나 수정한 복사본, 검토 대기·승인·게시는 내가
					시작한 문서가 여기에 표시됩니다. 관리자가 같은 복사본에서 작업 중이면
					상태 옆에 표시됩니다. 카테고리·상태 필터와 열 헤더 정렬은 번역 대기
					문서와 동일합니다.
				</div>

				{/* 필터: 번역 대기 문서와 동일 (대분류·소분류 + 상태) */}
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
									{WORKING_PAGE_STATUS_FILTER_ORDER.map((st) => {
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

				{/* 테이블 — 열 헤더 정렬 번역 대기 문서와 동일 */}
				{loading ||
				(isCopyFilterMode &&
					!copyFilterPrefetchDone &&
					categoryFilteredSortedSources.length > 0) ? (
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
							const row = item as WorkingRowItem;
							if (row.isLoadingRow) return;
							if (row.isCopyRow) {
								handleViewDetail(item);
							} else if (!isCopyFilterMode) {
								toggleSourceExpand(item.id);
							}
						}}
						getRowStyle={(item) => {
							const row = item as WorkingRowItem;
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
							const row = item as WorkingRowItem;
							if (row.isCopyRow || row.isLoadingRow)
								return { backgroundColor: "#C8C8C8" };
							return undefined;
						}}
						emptyMessage="표시할 문서가 없습니다. 카테고리·상태 필터를 확인해 주세요."
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
