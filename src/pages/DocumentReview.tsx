import type React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { documentApi, type DocumentResponse } from "../services/documentApi";
import {
	documentApi as docApi,
	DocumentVersionResponse,
} from "../services/documentApi";
import { reviewApi, type ReviewResponse } from "../services/reviewApi";
import { colors } from "../constants/designTokens";
import { Button } from "../components/Button";
import {
	extractParagraphs,
	getParagraphs,
	getParagraphAtScrollPosition,
	highlightParagraph,
	clearAllHighlights,
	Paragraph,
} from "../utils/paragraphUtils";
import ErrorBoundary from "../components/ErrorBoundary";
import {
	AlignLeft,
	AlignCenter,
	AlignRight,
	List,
	ListOrdered,
	Palette,
	Quote,
	Minus,
	Link2,
	Highlighter,
	Image,
	Table,
	Code,
	Superscript,
	Subscript,
	MoreVertical,
	Undo2,
	Redo2,
} from "lucide-react";
import "./TranslationWork.css";

export default function DocumentReview() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const documentId = id ? Number.parseInt(id, 10) : null;
	const reviewIdParam = searchParams.get("reviewId");

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [document, setDocument] = useState<DocumentResponse | null>(null);
	const [review, setReview] = useState<ReviewResponse | null>(null);
	const [originalContent, setOriginalContent] = useState<string>("");
	const [aiDraftContent, setAiDraftContent] = useState<string>("");
	const [translationContent, setTranslationContent] = useState<string>("");
	const [highlightedParagraphIndex, setHighlightedParagraphIndex] = useState<
		number | null
	>(null);
	const [showRejectModal, setShowRejectModal] = useState(false);
	const [rejectMessage, setRejectMessage] = useState("");

	// 패널 접기/전체화면 상태
	const [collapsedPanels, setCollapsedPanels] = useState<Set<string>>(
		new Set(),
	);
	const [fullscreenPanel, setFullscreenPanel] = useState<string | null>(null);

	// 패널 refs (iframe으로 변경)
	const originalIframeRef = useRef<HTMLIFrameElement>(null);
	const aiDraftIframeRef = useRef<HTMLIFrameElement>(null);
	const translationIframeRef = useRef<HTMLIFrameElement>(null);
	const isScrollingRef = useRef(false);

	// 원본 HTML 저장 (iframe 렌더링용)
	const [originalHtml, setOriginalHtml] = useState<string>("");
	const [aiDraftHtml, setAiDraftHtml] = useState<string>("");
	const [translationHtml, setTranslationHtml] = useState<string>("");

	// 에디터 상태 추가
	const [editorMode, setEditorMode] = useState<"text" | "component">("text");
	const [selectedElements, setSelectedElements] = useState<HTMLElement[]>([]);
	const [showLinkModal, setShowLinkModal] = useState(false);
	const [editingLink, setEditingLink] = useState<HTMLAnchorElement | null>(
		null,
	);
	const [linkUrl, setLinkUrl] = useState("");
	const [showMoreMenu, setShowMoreMenu] = useState(false);

	// Undo/Redo Stack for editing
	const undoStackRef = useRef<string[]>([]);
	const redoStackRef = useRef<string[]>([]);
	const currentEditorHtmlRef = useRef<string>("");

	// 이벤트 핸들러 저장 (제거를 위해)
	const componentClickHandlersRef = useRef<
		Map<HTMLElement, (e: Event) => void>
	>(new Map());
	const linkClickHandlersRef = useRef<Map<HTMLElement, (e: Event) => void>>(
		new Map(),
	);
	const windowKeydownHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(
		null,
	);
	const iframeKeydownHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(
		null,
	);

	// 초기 데이터 로드
	useEffect(() => {
		if (!documentId) {
			setError("문서 ID가 없습니다.");
			setLoading(false);
			return;
		}

		const loadData = async () => {
			try {
				setLoading(true);
				setError(null);

				// 1. 문서 정보 가져오기
				console.log("📄 문서 조회 시작:", documentId);
				const doc = await documentApi.getDocument(documentId);
				console.log("✅ 문서 조회 성공:", doc);
				setDocument(doc);

				// 2. 리뷰 정보 가져오기
				try {
					if (reviewIdParam) {
						// reviewId가 있으면 직접 조회
						const reviewId = Number.parseInt(reviewIdParam, 10);
						const review = await reviewApi.getReviewById(reviewId);
						setReview(review);
						console.log("✅ 리뷰 조회 성공 (ID로):", review);
					} else {
						// reviewId가 없으면 documentId로 조회
						const reviews = await reviewApi.getAllReviews({
							documentId,
							status: "PENDING",
						});
						if (reviews && reviews.length > 0) {
							setReview(reviews[0]); // 첫 번째 PENDING 리뷰 사용
							console.log("✅ 리뷰 조회 성공:", reviews[0]);
						} else {
							console.warn("⚠️ PENDING 상태의 리뷰가 없습니다.");
						}
					}
				} catch (reviewError: any) {
					console.error("리뷰 조회 실패:", reviewError);
					setError(
						"리뷰 정보를 불러오는데 실패했습니다: " +
							(reviewError.response?.data?.message || reviewError.message),
					);
				}

				// 3. 버전 정보 가져오기
				try {
					const versions = await docApi.getDocumentVersions(documentId);
					console.log(
						"📦 문서 버전 목록:",
						versions.map((v) => ({
							type: v.versionType,
							number: v.versionNumber,
						})),
					);

					if (!versions || versions.length === 0) {
						console.warn("⚠️ 문서 버전이 없습니다.");
						setError("문서 버전 정보를 찾을 수 없습니다.");
						setLoading(false);
						return;
					}

					// ORIGINAL 버전 찾기
					const originalVersion = versions.find(
						(v) => v.versionType === "ORIGINAL",
					);
					if (originalVersion) {
						const processedOriginal = extractParagraphs(
							originalVersion.content,
							"original",
						);
						setOriginalHtml(processedOriginal);
						setOriginalContent(processedOriginal);
						console.log("✅ 원문 버전 로드 완료");
					} else {
						console.warn("⚠️ ORIGINAL 버전이 없습니다.");
					}

					// AI_DRAFT 버전 찾기
					const aiDraftVersion = versions.find(
						(v) => v.versionType === "AI_DRAFT",
					);
					if (aiDraftVersion) {
						const processedAiDraft = extractParagraphs(
							aiDraftVersion.content,
							"ai-draft",
						);
						setAiDraftHtml(processedAiDraft);
						setAiDraftContent(processedAiDraft);
						console.log("✅ AI 초벌 번역 버전 로드 완료");
					} else {
						console.warn("⚠️ AI_DRAFT 버전이 없습니다.");
					}

					// MANUAL_TRANSLATION 버전 찾기 (검토 대상)
					const manualTranslationVersion = versions
						.filter((v) => v.versionType === "MANUAL_TRANSLATION")
						.sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0))[0]; // 최신 버전

					if (manualTranslationVersion) {
						console.log(
							"✅ 검토 대상 번역 발견:",
							manualTranslationVersion.versionNumber,
							"버전",
						);
						const processedManual = extractParagraphs(
							manualTranslationVersion.content,
							"manual",
						);
						setTranslationHtml(processedManual);
						setTranslationContent(processedManual);
					} else if (aiDraftVersion) {
						console.log("ℹ️ 수동 번역이 없어 AI 초벌 번역 사용");
						const processedAiDraft = extractParagraphs(
							aiDraftVersion.content,
							"ai-draft-editor",
						);
						setTranslationHtml(processedAiDraft);
						setTranslationContent(processedAiDraft);
					} else {
						console.warn("⚠️ 검토할 번역이 없습니다.");
						setError("검토할 번역 내용이 없습니다.");
						setLoading(false);
						return;
					}
				} catch (versionError: any) {
					console.error("버전 정보 조회 실패:", versionError);
					setError(
						"문서 버전 정보를 불러오는데 실패했습니다: " +
							(versionError.message || "알 수 없는 오류"),
					);
					setLoading(false);
					return;
				}
			} catch (err: any) {
				console.error("데이터 로드 실패:", err);
				let errorMessage = "데이터를 불러오는데 실패했습니다.";

				if (err.response?.data) {
					if (typeof err.response.data === "string") {
						errorMessage = err.response.data;
					} else if (err.response.data.message) {
						errorMessage = err.response.data.message;
					}
				} else if (err.message) {
					errorMessage = err.message;
				}

				setError(errorMessage);
			} finally {
				setLoading(false);
			}
		};

		loadData();
	}, [documentId]);

	// 원문 iframe 렌더링 + 문단 클릭/호버 이벤트
	useEffect(() => {
		const iframe = originalIframeRef.current;
		if (!iframe || !originalHtml) return;

		const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
		if (iframeDoc) {
			try {
				iframeDoc.open();
				iframeDoc.write(originalHtml);
				iframeDoc.close();

				const style = iframeDoc.createElement("style");
				style.textContent = `
          * {
            border: none !important;
            outline: none !important;
          }
          body {
            cursor: default !important;
          }
        `;
				iframeDoc.head.appendChild(style);

				if (iframeDoc.body) {
					iframeDoc.body.style.cursor = "default";
					iframeDoc.body.contentEditable = "false";
				}

				const paragraphs = iframeDoc.querySelectorAll("[data-paragraph-index]");
				paragraphs.forEach((para) => {
					const element = para as HTMLElement;
					const indexAttr = element.getAttribute("data-paragraph-index");
					const index = Number.parseInt(indexAttr || "0", 10);

					element.addEventListener("mouseenter", () => {
						setHighlightedParagraphIndex(index);
					});

					element.addEventListener("click", () => {
						setHighlightedParagraphIndex(index);
					});
				});
			} catch (error) {
				console.error("❌ 원문 iframe 오류:", error);
			}
		}
	}, [originalHtml, collapsedPanels, fullscreenPanel]);

	// AI 초벌 번역 iframe 렌더링 + 문단 클릭/호버 이벤트
	useEffect(() => {
		const iframe = aiDraftIframeRef.current;
		if (!iframe || !aiDraftHtml) return;

		const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
		if (iframeDoc) {
			try {
				iframeDoc.open();
				iframeDoc.write(aiDraftHtml);
				iframeDoc.close();

				const style = iframeDoc.createElement("style");
				style.textContent = `
          * {
            border: none !important;
            outline: none !important;
          }
          body {
            cursor: default !important;
          }
        `;
				iframeDoc.head.appendChild(style);

				if (iframeDoc.body) {
					iframeDoc.body.style.cursor = "default";
					iframeDoc.body.contentEditable = "false";
				}

				const paragraphs = iframeDoc.querySelectorAll("[data-paragraph-index]");
				paragraphs.forEach((para) => {
					const element = para as HTMLElement;
					const indexAttr = element.getAttribute("data-paragraph-index");
					const index = Number.parseInt(indexAttr || "0", 10);

					element.addEventListener("mouseenter", () => {
						setHighlightedParagraphIndex(index);
					});

					element.addEventListener("click", () => {
						setHighlightedParagraphIndex(index);
					});
				});
			} catch (error) {
				console.error("❌ AI 초벌 iframe 오류:", error);
			}
		}
	}, [aiDraftHtml, collapsedPanels, fullscreenPanel]);

	// 번역 iframe 렌더링 및 에디터 모드 설정
	useEffect(() => {
		const iframe = translationIframeRef.current;
		if (!iframe || !translationHtml) return;

		const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
		if (!iframeDoc) return;

		try {
			iframeDoc.open();
			iframeDoc.write(translationHtml);
			iframeDoc.close();

			// currentEditorHtmlRef 초기화
			currentEditorHtmlRef.current = translationHtml;

			if (editorMode === "text") {
				// 텍스트 편집 모드
				console.log("📝 [DocumentReview] 텍스트 편집 모드 활성화");

				// 기존 컴포넌트 편집 관련 핸들러 제거
				componentClickHandlersRef.current.forEach((handler, el) => {
					el.removeEventListener("click", handler, true);
				});
				componentClickHandlersRef.current.clear();

				// Outline 스타일 제거
				const textEditOverrideStyle = iframeDoc.createElement("style");
				textEditOverrideStyle.id = "text-edit-override-styles";
				textEditOverrideStyle.textContent = `
          * {
            outline: none !important;
          }
          *:focus {
            outline: none !important;
          }
        `;
				const existingOverride = iframeDoc.getElementById(
					"text-edit-override-styles",
				);
				if (existingOverride) {
					existingOverride.remove();
				}
				iframeDoc.head.appendChild(textEditOverrideStyle);

				// contentEditable 설정
				if (iframeDoc.body) {
					iframeDoc.body.contentEditable = "true";
					iframeDoc.body.style.cursor = "text";
				}

				// 모든 텍스트 요소를 편집 가능하게
				const editableElements = iframeDoc.querySelectorAll(
					"p, h1, h2, h3, h4, h5, h6, span, div, li, td, th, label, a, button, article, section, header, footer, main, aside",
				);
				editableElements.forEach((el) => {
					if (
						el.tagName &&
						!["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)
					) {
						(el as HTMLElement).contentEditable = "true";
						(el as HTMLElement).style.cursor = "text";
					}
				});

				// 스크립트, 스타일 태그는 편집 불가능하게
				const scripts = iframeDoc.querySelectorAll("script, style, noscript");
				scripts.forEach((el) => {
					(el as HTMLElement).contentEditable = "false";
				});

				// user-select 스타일 추가
				const textEditStyle = iframeDoc.createElement("style");
				textEditStyle.id = "text-edit-styles";
				textEditStyle.textContent = `
          body, * {
            user-select: text !important;
            -webkit-user-select: text !important;
            cursor: text !important;
          }
        `;
				const existingTextStyle = iframeDoc.getElementById("text-edit-styles");
				if (existingTextStyle) {
					existingTextStyle.remove();
				}
				iframeDoc.head.appendChild(textEditStyle);

				// 링크 클릭 핸들러 (편집 모달)
				linkClickHandlersRef.current.forEach((handler, link) => {
					link.removeEventListener("click", handler, true);
				});
				linkClickHandlersRef.current.clear();

				const allLinks = iframeDoc.querySelectorAll("a");
				const handleLinkClick = (e: Event) => {
					const mouseEvent = e as MouseEvent;

					if (mouseEvent.ctrlKey || mouseEvent.metaKey) {
						return true;
					}

					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();

					const linkElement = e.currentTarget as HTMLAnchorElement;
					setEditingLink(linkElement);
					setLinkUrl(linkElement.href || "");
					setShowLinkModal(true);

					return false;
				};

				allLinks.forEach((link) => {
					const htmlLink = link as HTMLElement;
					htmlLink.addEventListener("click", handleLinkClick, true);
					linkClickHandlersRef.current.set(htmlLink, handleLinkClick);
					htmlLink.style.cursor = "pointer";
					htmlLink.style.textDecoration = "underline";
				});

				// 링크 스타일 CSS
				const linkStyle = iframeDoc.createElement("style");
				linkStyle.id = "text-edit-link-style";
				linkStyle.textContent = `
          a {
            cursor: text !important;
            pointer-events: auto !important;
          }
          a:hover {
            text-decoration: underline !important;
          }
        `;
				const existingLinkStyle = iframeDoc.getElementById(
					"text-edit-link-style",
				);
				if (existingLinkStyle) {
					existingLinkStyle.remove();
				}
				iframeDoc.head.appendChild(linkStyle);

				// 키보드 이벤트 처리 (Undo/Redo)
				const handleKeyDown = (e: KeyboardEvent) => {
					if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
						e.preventDefault();
						e.stopImmediatePropagation();
						iframeDoc.execCommand("undo", false);
						const updatedHtml = iframeDoc.documentElement.outerHTML;
						currentEditorHtmlRef.current = updatedHtml;
						console.log("↩️ Undo (DocumentReview 텍스트 편집)");
					} else if (
						(e.ctrlKey || e.metaKey) &&
						(e.key === "y" || (e.key === "z" && e.shiftKey))
					) {
						e.preventDefault();
						e.stopImmediatePropagation();
						iframeDoc.execCommand("redo", false);
						const updatedHtml = iframeDoc.documentElement.outerHTML;
						currentEditorHtmlRef.current = updatedHtml;
						console.log("↪️ Redo (DocumentReview 텍스트 편집)");
					}
				};

				if (iframeKeydownHandlerRef.current && iframeDoc) {
					iframeDoc.removeEventListener(
						"keydown",
						iframeKeydownHandlerRef.current,
						true,
					);
				}
				iframeKeydownHandlerRef.current = handleKeyDown;
				iframeDoc.addEventListener("keydown", handleKeyDown, true);
				console.log("✅ DocumentReview 텍스트 모드 키보드 단축키 등록 완료");

				// input 이벤트 처리 (변경 사항 추적)
				let inputTimeoutId: ReturnType<typeof setTimeout> | null = null;
				const handleInput = () => {
					if (inputTimeoutId) {
						clearTimeout(inputTimeoutId);
					}
					inputTimeoutId = setTimeout(() => {
						const updatedHtml = iframeDoc.documentElement.outerHTML;
						setTranslationHtml(updatedHtml);
						currentEditorHtmlRef.current = updatedHtml;
						inputTimeoutId = null;
					}, 500);
				};
				iframeDoc.body.addEventListener("input", handleInput);
			} else if (editorMode === "component") {
				// 컴포넌트 편집 모드
				console.log("🧩 [DocumentReview] 컴포넌트 편집 모드 활성화");

				// 브라우저 텍스트 선택 초기화
				const selection = iframeDoc.defaultView?.getSelection();
				if (selection) {
					selection.removeAllRanges();
				}

				// selectedElements state 초기화
				setSelectedElements([]);

				// 기존 컴포넌트 핸들러 제거
				componentClickHandlersRef.current.forEach((handler, el) => {
					el.removeEventListener("click", handler, true);
				});
				componentClickHandlersRef.current.clear();

				// 기존 스타일 제거
				const textEditOverrideStyle = iframeDoc.getElementById(
					"text-edit-override-styles",
				);
				if (textEditOverrideStyle) {
					textEditOverrideStyle.remove();
				}
				const textEditStyle = iframeDoc.getElementById("text-edit-styles");
				if (textEditStyle) {
					textEditStyle.remove();
				}

				// 링크 클릭 핸들러 제거
				linkClickHandlersRef.current.forEach((handler, link) => {
					link.removeEventListener("click", handler, true);
				});
				linkClickHandlersRef.current.clear();

				const linkStyle = iframeDoc.getElementById("text-edit-link-style");
				if (linkStyle) {
					linkStyle.remove();
				}

				// contentEditable 비활성화
				const allEditableElements =
					iframeDoc.querySelectorAll("[contenteditable]");
				allEditableElements.forEach((el) => {
					(el as HTMLElement).contentEditable = "false";
				});

				// 컴포넌트 편집 모드 스타일 추가
				const style = iframeDoc.createElement("style");
				style.id = "editor-styles";
				style.textContent = `
          div[data-component-editable],
          section[data-component-editable],
          article[data-component-editable],
          header[data-component-editable],
          footer[data-component-editable],
          main[data-component-editable],
          aside[data-component-editable],
          nav[data-component-editable],
          p[data-component-editable],
          h1[data-component-editable],
          h2[data-component-editable],
          h3[data-component-editable],
          h4[data-component-editable],
          h5[data-component-editable],
          h6[data-component-editable],
          a[data-component-editable] {
            outline: 1px dashed #C0C0C0 !important;
            cursor: pointer !important;
          }
          div[data-component-editable]:hover,
          section[data-component-editable]:hover,
          article[data-component-editable]:hover,
          p[data-component-editable]:hover,
          h1[data-component-editable]:hover,
          h2[data-component-editable]:hover,
          h3[data-component-editable]:hover,
          a[data-component-editable]:hover {
            outline: 2px solid #808080 !important;
          }
          .component-selected {
            outline: 4px solid #28a745 !important;
            outline-offset: 3px !important;
            background-color: rgba(40, 167, 69, 0.25) !important;
            box-shadow: 0 0 0 4px rgba(40, 167, 69, 0.4), 0 4px 12px rgba(40, 167, 69, 0.5) !important;
            position: relative !important;
            transition: all 0.2s ease !important;
          }
        `;
				iframeDoc.head.appendChild(style);

				// 클릭 가능한 컴포넌트 표시
				const componentElements = iframeDoc.querySelectorAll(
					"div, section, article, header, footer, main, aside, nav, p, h1, h2, h3, h4, h5, h6, a",
				);

				// 키보드 단축키 (컴포넌트 모드 Undo/Redo)
				const handleKeydown = (e: KeyboardEvent) => {
					if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
						e.preventDefault();
						e.stopImmediatePropagation();

						if (undoStackRef.current.length > 0) {
							console.log(
								"↩️ Undo (컴포넌트 편집) - stack:",
								undoStackRef.current.length,
							);

							redoStackRef.current.push(currentEditorHtmlRef.current);
							const previousHtml = undoStackRef.current.pop()!;
							currentEditorHtmlRef.current = previousHtml;

							iframeDoc.open();
							iframeDoc.write(previousHtml);
							iframeDoc.close();

							setTranslationHtml(previousHtml);
							setSelectedElements([]);

							setTimeout(() => {
								const newIframeDoc =
									iframe.contentDocument || iframe.contentWindow?.document;
								if (newIframeDoc?.body) {
									newIframeDoc.body.setAttribute("tabindex", "-1");
									newIframeDoc.body.focus();
								}
							}, 50);
						} else {
							console.log("⚠️ Undo stack이 비어있습니다");
						}
					} else if (
						(e.ctrlKey || e.metaKey) &&
						(e.key === "y" || (e.key === "z" && e.shiftKey))
					) {
						e.preventDefault();
						e.stopImmediatePropagation();

						if (redoStackRef.current.length > 0) {
							console.log(
								"↪️ Redo (컴포넌트 편집) - stack:",
								redoStackRef.current.length,
							);

							undoStackRef.current.push(currentEditorHtmlRef.current);
							const nextHtml = redoStackRef.current.pop()!;
							currentEditorHtmlRef.current = nextHtml;

							iframeDoc.open();
							iframeDoc.write(nextHtml);
							iframeDoc.close();

							setTranslationHtml(nextHtml);
							setSelectedElements([]);

							setTimeout(() => {
								const newIframeDoc =
									iframe.contentDocument || iframe.contentWindow?.document;
								if (newIframeDoc?.body) {
									newIframeDoc.body.setAttribute("tabindex", "-1");
									newIframeDoc.body.focus();
								}
							}, 50);
						} else {
							console.log("⚠️ Redo stack이 비어있습니다");
						}
					}
				};

				if (iframeKeydownHandlerRef.current && iframeDoc) {
					iframeDoc.removeEventListener(
						"keydown",
						iframeKeydownHandlerRef.current,
						true,
					);
				}
				iframeKeydownHandlerRef.current = handleKeydown;
				iframeDoc.addEventListener("keydown", handleKeydown, true);
				console.log("✅ DocumentReview 컴포넌트 모드 키보드 단축키 등록 완료");

				// window 키보드 이벤트도 처리
				const handleWindowKeydown = (e: KeyboardEvent) => {
					if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
						e.preventDefault();
						e.stopImmediatePropagation();

						if (undoStackRef.current.length > 0 && iframeDoc) {
							console.log("↩️ Undo (DocumentReview 컴포넌트 편집 - window)");

							redoStackRef.current.push(currentEditorHtmlRef.current);
							const previousHtml = undoStackRef.current.pop()!;
							currentEditorHtmlRef.current = previousHtml;

							iframeDoc.open();
							iframeDoc.write(previousHtml);
							iframeDoc.close();

							setTranslationHtml(previousHtml);
							setSelectedElements([]);

							setTimeout(() => {
								const newIframeDoc =
									iframe.contentDocument || iframe.contentWindow?.document;
								if (newIframeDoc?.body) {
									newIframeDoc.body.setAttribute("tabindex", "-1");
									newIframeDoc.body.focus();
								}
							}, 50);
						}
					} else if (
						(e.ctrlKey || e.metaKey) &&
						(e.key === "y" || (e.key === "z" && e.shiftKey))
					) {
						e.preventDefault();
						e.stopImmediatePropagation();

						if (redoStackRef.current.length > 0 && iframeDoc) {
							console.log("↪️ Redo (DocumentReview 컴포넌트 편집 - window)");

							undoStackRef.current.push(currentEditorHtmlRef.current);
							const nextHtml = redoStackRef.current.pop()!;
							currentEditorHtmlRef.current = nextHtml;

							iframeDoc.open();
							iframeDoc.write(nextHtml);
							iframeDoc.close();

							setTranslationHtml(nextHtml);
							setSelectedElements([]);

							setTimeout(() => {
								const newIframeDoc =
									iframe.contentDocument || iframe.contentWindow?.document;
								if (newIframeDoc?.body) {
									newIframeDoc.body.setAttribute("tabindex", "-1");
									newIframeDoc.body.focus();
								}
							}, 50);
						}
					}
				};

				if (windowKeydownHandlerRef.current) {
					window.removeEventListener(
						"keydown",
						windowKeydownHandlerRef.current,
						true,
					);
				}
				windowKeydownHandlerRef.current = handleWindowKeydown;
				window.addEventListener("keydown", handleWindowKeydown, true);
				console.log("✅ DocumentReview window 키보드 이벤트 리스너 등록 완료");

				// 컴포넌트 클릭 핸들러 (다중 선택 + 토글)
				const handleComponentClick = (e: Event) => {
					e.stopPropagation();
					e.preventDefault();

					const target = e.target as HTMLElement;
					if (
						!target ||
						["SCRIPT", "STYLE", "NOSCRIPT", "HTML", "HEAD", "BODY"].includes(
							target.tagName,
						)
					)
						return;

					const editableElement = target.closest(
						"[data-component-editable]",
					) as HTMLElement;
					if (!editableElement) {
						console.log(
							"⚠️ 편집 가능한 요소를 찾을 수 없습니다:",
							target.tagName,
						);
						return;
					}

					const isSelected =
						editableElement.classList.contains("component-selected");

					if (isSelected) {
						editableElement.classList.remove("component-selected");
						editableElement.style.outline = "1px dashed #C0C0C0";
						editableElement.style.boxShadow = "none";
						setSelectedElements((prev) =>
							prev.filter((el) => el !== editableElement),
						);
					} else {
						editableElement.classList.add("component-selected");
						editableElement.style.outline = "3px solid #000000";
						editableElement.style.boxShadow = "none";
						setSelectedElements((prev) => [...prev, editableElement]);
					}
				};

				// 이벤트 리스너 등록
				componentElements.forEach((el) => {
					if (
						el.tagName &&
						!["SCRIPT", "STYLE", "NOSCRIPT", "HTML", "HEAD", "BODY"].includes(
							el.tagName,
						)
					) {
						const htmlEl = el as HTMLElement;
						htmlEl.setAttribute("data-component-editable", "true");
						htmlEl.style.cursor = "pointer";
						htmlEl.style.outline = "1px dashed #C0C0C0";

						htmlEl.addEventListener("click", handleComponentClick, true);
						componentClickHandlersRef.current.set(htmlEl, handleComponentClick);
					}
				});

				// contentEditable 비활성화
				const allElements = iframeDoc.querySelectorAll("*");
				allElements.forEach((el) => {
					(el as HTMLElement).contentEditable = "false";
				});
			}
		} catch (error) {
			console.error("❌ 번역 iframe 오류:", error);
		}

		// Cleanup
		return () => {
			if (windowKeydownHandlerRef.current) {
				window.removeEventListener(
					"keydown",
					windowKeydownHandlerRef.current,
					true,
				);
			}
		};
	}, [translationHtml, collapsedPanels, fullscreenPanel, editorMode]);

	// 더보기 메뉴 외부 클릭 시 닫기
	useEffect(() => {
		const handleWindowClick = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (!target.closest("[data-more-menu]")) {
				setShowMoreMenu(false);
			}
		};

		if (showMoreMenu) {
			window.addEventListener("click", handleWindowClick);
		}

		return () => {
			window.removeEventListener("click", handleWindowClick);
		};
	}, [showMoreMenu]);

	// 문단 하이라이트 동기화
	useEffect(() => {
		const applyParagraphStyles = (
			panel: HTMLElement | null,
			panelName: string,
		) => {
			if (!panel) return;
			clearAllHighlights(panel);

			const paragraphs = getParagraphs(panel);
			paragraphs.forEach((para) => {
				const isHighlighted = para.index === highlightedParagraphIndex;
				if (isHighlighted) {
					highlightParagraph(para.element, true);
				}
			});
		};

		if (originalIframeRef.current?.contentDocument?.body) {
			applyParagraphStyles(
				originalIframeRef.current.contentDocument.body as HTMLElement,
				"원문",
			);
		}

		if (aiDraftIframeRef.current?.contentDocument?.body) {
			applyParagraphStyles(
				aiDraftIframeRef.current.contentDocument.body as HTMLElement,
				"AI 초벌",
			);
		}

		if (translationIframeRef.current?.contentDocument?.body) {
			applyParagraphStyles(
				translationIframeRef.current.contentDocument.body as HTMLElement,
				"번역",
			);
		}
	}, [highlightedParagraphIndex]);

	// 패널 접기/펼치기
	const togglePanel = (panelId: string) => {
		setCollapsedPanels((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(panelId)) {
				newSet.delete(panelId);
			} else {
				newSet.add(panelId);
			}
			return newSet;
		});
	};

	// 전체화면 토글
	const toggleFullscreen = (panelId: string) => {
		setFullscreenPanel((prev) => (prev === panelId ? null : panelId));
	};

	// 번역본(검토 대상) 패널의 현재 수정 내용을 새 버전으로 저장
	const handleSaveTranslationPanel = async () => {
		if (!documentId) {
			alert("문서 ID가 없습니다.");
			return;
		}

		const iframe = translationIframeRef.current;
		const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
		if (!iframeDoc?.documentElement) {
			alert("번역본 내용을 읽을 수 없습니다.");
			return;
		}

		const editedHtml = iframeDoc.documentElement.outerHTML;
		if (!editedHtml || editedHtml === translationContent) {
			alert("저장할 변경사항이 없습니다.");
			return;
		}

		try {
			await docApi.createDocumentVersion(documentId, {
				versionType: "MANUAL_TRANSLATION",
				content: editedHtml,
			});

			setTranslationHtml(editedHtml);
			setTranslationContent(editedHtml);
			currentEditorHtmlRef.current = editedHtml;

			alert("번역본 수정사항이 저장되었습니다.");
		} catch (error: any) {
			console.error("번역본 저장 실패:", error);
			alert(
				"저장에 실패했습니다: " +
					(error.response?.data?.message || error.message || "알 수 없는 오류"),
			);
		}
	};

	// 승인 처리
	const handleApprove = async () => {
		if (!documentId) {
			alert("문서 ID가 없습니다.");
			return;
		}

		// iframe에서 최신 HTML 가져오기
		const iframe = translationIframeRef.current;
		let editedHtml = translationHtml;

		if (iframe) {
			const iframeDoc =
				iframe.contentDocument || iframe.contentWindow?.document;
			if (iframeDoc && iframeDoc.documentElement) {
				editedHtml = iframeDoc.documentElement.outerHTML;
				console.log("💾 승인 시 수정된 HTML 사용");
			}
		}

		if (!review) {
			// 리뷰가 없으면 먼저 리뷰를 생성해야 함
			// 버전 정보를 다시 가져와서 최신 MANUAL_TRANSLATION 버전 찾기
			try {
				const versions = await docApi.getDocumentVersions(documentId);
				let manualTranslationVersion = versions
					.filter((v) => v.versionType === "MANUAL_TRANSLATION")
					.sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0))[0];

				if (!manualTranslationVersion) {
					alert("검토할 번역 버전을 찾을 수 없습니다.");
					return;
				}

				// 수정된 내용이 있으면 새 버전으로 저장
				if (editedHtml !== translationContent) {
					console.log("✅ 수정된 내용을 새 버전으로 저장");
					const newVersion = await docApi.createDocumentVersion(documentId, {
						versionType: "MANUAL_TRANSLATION",
						content: editedHtml,
					});
					manualTranslationVersion = newVersion;
				}

				// 리뷰 생성
				const newReview = await reviewApi.createReview({
					documentId,
					documentVersionId: manualTranslationVersion.id,
					isComplete: true, // 기본값으로 완전 번역으로 설정
				});
				setReview(newReview);

				if (
					!window.confirm(
						"이 문서를 승인하시겠습니까? 승인 후 문서 상태가 변경됩니다.",
					)
				) {
					return;
				}

				await reviewApi.approveReview(newReview.id);
				alert("문서가 승인되었습니다.");
				navigate("/reviews");
			} catch (error: any) {
				console.error("리뷰 생성 또는 승인 실패:", error);
				alert(
					"승인 처리에 실패했습니다: " +
						(error.response?.data?.message || error.message),
				);
			}
			return;
		}

		// 리뷰가 이미 있는 경우
		try {
			// 수정된 내용이 있으면 새 버전으로 저장
			if (editedHtml !== translationContent) {
				console.log("✅ 수정된 내용을 새 버전으로 저장");
				const newVersion = await docApi.createDocumentVersion(documentId, {
					versionType: "MANUAL_TRANSLATION",
					content: editedHtml,
				});

				// 리뷰 업데이트 (새 버전으로 교체)
				await reviewApi.updateReview(review.id, {
					documentVersionId: newVersion.id,
				});
			}

			if (
				!window.confirm(
					"이 문서를 승인하시겠습니까? 승인 후 문서 상태가 변경됩니다.",
				)
			) {
				return;
			}

			await reviewApi.approveReview(review.id);
			alert("문서가 승인되었습니다.");
			navigate("/reviews");
		} catch (error: any) {
			console.error("승인 실패:", error);
			alert(
				"승인 처리에 실패했습니다: " +
					(error.response?.data?.message || error.message),
			);
		}
	};

	// 반려 처리
	const handleReject = async () => {
		if (!rejectMessage.trim()) {
			alert("반려 사유를 입력해주세요.");
			return;
		}

		if (!review) {
			// 리뷰가 없으면 먼저 리뷰를 생성해야 함
			if (!documentId) {
				alert("문서 ID가 없습니다.");
				return;
			}

			// 버전 정보를 다시 가져와서 최신 MANUAL_TRANSLATION 버전 찾기
			try {
				const versions = await docApi.getDocumentVersions(documentId);
				const manualTranslationVersion = versions
					.filter((v) => v.versionType === "MANUAL_TRANSLATION")
					.sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0))[0];

				if (!manualTranslationVersion) {
					alert("검토할 번역 버전을 찾을 수 없습니다.");
					return;
				}

				// 리뷰 생성 (반려 메시지 포함)
				const newReview = await reviewApi.createReview({
					documentId,
					documentVersionId: manualTranslationVersion.id,
					comment: rejectMessage,
					isComplete: false,
				});
				setReview(newReview);

				// 반려 처리
				await reviewApi.rejectReview(newReview.id);

				alert(
					"문서가 반려되었습니다. 문서가 다시 번역 대기 상태로 변경됩니다.",
				);
				navigate("/reviews");
			} catch (error: any) {
				console.error("리뷰 생성 또는 반려 실패:", error);
				alert(
					"반려 처리에 실패했습니다: " +
						(error.response?.data?.message || error.message),
				);
			}
			return;
		}

		try {
			// 먼저 리뷰에 코멘트 추가
			await reviewApi.updateReview(review.id, { comment: rejectMessage });

			// 그 다음 반려 처리
			await reviewApi.rejectReview(review.id);

			alert("문서가 반려되었습니다. 문서가 다시 번역 대기 상태로 변경됩니다.");
			navigate("/reviews");
		} catch (error: any) {
			console.error("반려 실패:", error);
			alert(
				"반려 처리에 실패했습니다: " +
					(error.response?.data?.message || error.message),
			);
		}
	};

	if (loading) {
		return (
			<div
				style={{
					padding: "48px",
					textAlign: "center",
					color: colors.primaryText,
				}}
			>
				로딩 중...
			</div>
		);
	}

	if (error || !document) {
		return (
			<div style={{ padding: "48px" }}>
				<div
					style={{
						padding: "16px",
						backgroundColor: "#F5F5F5",
						border: `1px solid ${colors.border}`,
						borderRadius: "8px",
						color: colors.primaryText,
						marginBottom: "16px",
					}}
				>
					⚠️ {error || "문서를 불러올 수 없습니다."}
				</div>
				<div>
					<Button variant="secondary" onClick={() => navigate("/reviews")}>
						목록으로 돌아가기
					</Button>
				</div>
			</div>
		);
	}

	// 상태 텍스트 변환
	const getStatusText = (status: string) => {
		const statusMap: Record<string, string> = {
			DRAFT: "초안",
			PENDING_TRANSLATION: "번역 대기",
			IN_TRANSLATION: "번역 중",
			PENDING_REVIEW: "검토 대기",
			APPROVED: "번역 완료",
			PUBLISHED: "공개됨",
		};
		return statusMap[status] || status;
	};

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100vh",
				backgroundColor: colors.primaryBackground,
			}}
		>
			{/* 상단 고정 바 */}
			<div
				style={{
					padding: "12px 24px",
					backgroundColor: colors.surface,
					borderBottom: `1px solid ${colors.border}`,
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					gap: "16px",
				}}
			>
				{/* 왼쪽: 뒤로가기 + 문서 정보 */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "16px",
						flex: 1,
					}}
				>
					<Button
						variant="secondary"
						onClick={() => navigate("/reviews")}
						style={{ fontSize: "12px", padding: "6px 12px" }}
					>
						← 뒤로가기
					</Button>

					{document && (
						<div
							style={{ display: "flex", flexDirection: "column", gap: "2px" }}
						>
							<div
								style={{ fontSize: "14px", fontWeight: 600, color: "#000000" }}
							>
								{document.title}
							</div>
							<div
								style={{ display: "flex", gap: "12px", alignItems: "center" }}
							>
								<span style={{ fontSize: "11px", color: colors.secondaryText }}>
									{document.categoryId
										? `카테고리 ${document.categoryId}`
										: "미분류"}{" "}
									· {getStatusText(document.status)}
								</span>
								{review && (
									<span
										style={{ fontSize: "11px", color: colors.secondaryText }}
									>
										검토자: {review.reviewer?.name || "-"}
									</span>
								)}
							</div>
						</div>
					)}
				</div>

				{/* 중앙: 문서 보기 옵션 */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "24px",
						padding: "6px 16px",
						backgroundColor: "#F8F9FA",
						borderRadius: "6px",
						border: "1px solid #D3D3D3",
					}}
				>
					<span
						style={{
							fontSize: "12px",
							fontWeight: 600,
							color: colors.primaryText,
						}}
					>
						문서 보기:
					</span>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							fontSize: "13px",
							cursor: "pointer",
							fontWeight: 500,
						}}
					>
						<input
							type="checkbox"
							checked={!collapsedPanels.has("original")}
							onChange={() => togglePanel("original")}
							style={{
								cursor: "pointer",
								width: "16px",
								height: "16px",
							}}
						/>
						<span style={{ color: "#000000" }}>원문 (Version 0)</span>
					</label>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							fontSize: "13px",
							cursor: "pointer",
							fontWeight: 500,
						}}
					>
						<input
							type="checkbox"
							checked={!collapsedPanels.has("aiDraft")}
							onChange={() => togglePanel("aiDraft")}
							style={{
								cursor: "pointer",
								width: "16px",
								height: "16px",
							}}
						/>
						<span style={{ color: "#000000" }}>AI 초벌 번역 (Version 1)</span>
					</label>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							fontSize: "13px",
							cursor: "pointer",
							fontWeight: 500,
						}}
					>
						<input
							type="checkbox"
							checked={!collapsedPanels.has("translation")}
							onChange={() => togglePanel("translation")}
							style={{
								cursor: "pointer",
								width: "16px",
								height: "16px",
							}}
						/>
						<span style={{ color: "#000000" }}>번역본 (검토 대상)</span>
					</label>
				</div>

				{/* 오른쪽: HTML 다운로드, 승인/반려 버튼 */}
				<div style={{ display: "flex", gap: "8px" }}>
					<Button
						variant="secondary"
						onClick={() => {
							const iframe = translationIframeRef.current;
							if (!iframe) return;

							const iframeDoc =
								iframe.contentDocument || iframe.contentWindow?.document;
							if (!iframeDoc) return;

							const html = iframeDoc.documentElement.outerHTML;
							const blob = new Blob([html], { type: "text/html" });
							const url = URL.createObjectURL(blob);
							const a = document.createElement("a");
							a.href = url;
							a.download = `${document?.title || "document"}_edited.html`;
							a.click();
							URL.revokeObjectURL(url);
						}}
						style={{ fontSize: "12px" }}
					>
						💾 HTML 다운로드
					</Button>
					<Button
						variant="secondary"
						onClick={() => setShowRejectModal(true)}
						style={{ fontSize: "12px" }}
					>
						반려
					</Button>
					<Button
						variant="primary"
						onClick={handleApprove}
						style={{ fontSize: "12px" }}
					>
						승인
					</Button>
				</div>
			</div>

			{/* 3단 레이아웃 */}
			<div
				style={{ display: "flex", height: "100%", gap: "4px", padding: "4px" }}
			>
				{[
					{
						id: "original",
						title: "원문",
						ref: originalIframeRef,
						html: originalHtml,
					},
					{
						id: "aiDraft",
						title: "AI 초벌 번역",
						ref: aiDraftIframeRef,
						html: aiDraftHtml,
					},
					{
						id: "translation",
						title: "번역본 (검토 대상)",
						ref: translationIframeRef,
						html: translationHtml,
					},
				].map((panel) => {
					const isCollapsed = collapsedPanels.has(panel.id);
					const isFullscreen = fullscreenPanel === panel.id;
					const visiblePanels = ["original", "aiDraft", "translation"].filter(
						(id) => !collapsedPanels.has(id),
					);
					const hasFullscreen = fullscreenPanel !== null;
					const isHidden = hasFullscreen && !isFullscreen;

					if (isHidden) return null;

					return (
						<div
							key={panel.id}
							style={{
								flex: isCollapsed
									? "0 0 0"
									: isFullscreen
										? "1"
										: `1 1 ${100 / visiblePanels.length}%`,
								display: isCollapsed ? "none" : "flex",
								flexDirection: "column",
								transition: "flex 0.2s ease",
								minWidth: isCollapsed ? "0" : "200px",
							}}
						>
							{/* 패널 헤더 */}
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									padding: "8px 12px",
									backgroundColor: "#D3D3D3",
									borderRadius: "4px 4px 0 0",
									cursor: "default",
									height: "36px",
								}}
							>
								<span
									style={{
										fontSize: "12px",
										fontWeight: 600,
										color: "#000000",
									}}
								>
									{panel.title}
								</span>
								<div
									style={{ display: "flex", alignItems: "center", gap: "8px" }}
								>
									{panel.id === "translation" && (
										<button
											type="button"
											onClick={handleSaveTranslationPanel}
											style={{
												padding: "4px 8px",
												fontSize: "11px",
												border: "1px solid #A9A9A9",
												borderRadius: "3px",
												backgroundColor: "#FFFFFF",
												color: "#000000",
												cursor: "pointer",
												fontWeight: 500,
											}}
											title="번역본 수정사항 저장"
										>
											저장하기
										</button>
									)}
									<button
										onClick={() => toggleFullscreen(panel.id)}
										style={{
											padding: "4px 8px",
											fontSize: "11px",
											border: "1px solid #A9A9A9",
											borderRadius: "3px",
											backgroundColor: "#FFFFFF",
											color: "#000000",
											cursor: "pointer",
											fontWeight: 500,
										}}
										title={isFullscreen ? "확대 해제" : "전체화면 확대"}
									>
										{isFullscreen ? "축소" : "확대"}
									</button>
								</div>
							</div>

							{/* 패널 내용 */}
							<div
								style={{
									flex: 1,
									border: "1px solid #C0C0C0",
									borderTop: "none",
									borderRadius: "0 0 4px 4px",
									overflow: "hidden",
									backgroundColor: "#FFFFFF",
									display: "flex",
									flexDirection: "column",
									position: "relative",
								}}
							>
								{panel.id === "translation" ? (
									// 번역본 패널 - 에디터 툴바 포함
									<>
										{/* 편집 툴바 */}
										<div
											style={{
												padding: "8px 12px",
												borderBottom: "1px solid #C0C0C0",
												display: "flex",
												justifyContent: "flex-start",
												alignItems: "center",
												backgroundColor: "#F8F9FA",
												flexWrap: "wrap",
												gap: "8px",
											}}
										>
											<div
												style={{
													display: "flex",
													gap: "4px",
													alignItems: "center",
													flexWrap: "wrap",
												}}
											>
												{/* 모드 선택 */}
												<Button
													variant={
														editorMode === "text" ? "primary" : "secondary"
													}
													onClick={() => setEditorMode("text")}
													style={{ fontSize: "11px", padding: "4px 8px" }}
												>
													텍스트 편집
												</Button>
												<Button
													variant={
														editorMode === "component" ? "primary" : "secondary"
													}
													onClick={() => setEditorMode("component")}
													style={{ fontSize: "11px", padding: "4px 8px" }}
												>
													컴포넌트 편집
												</Button>

												{/* Rich Text 기능 (텍스트 모드일 때만) */}
												{editorMode === "text" && (
													<>
														<div
															style={{
																width: "1px",
																height: "20px",
																backgroundColor: "#C0C0C0",
																margin: "0 4px",
															}}
														/>

														{/* 실행 취소/다시 실행 버튼 */}
														<button
															onClick={() => {
																const iframeDoc =
																	translationIframeRef.current?.contentDocument;
																if (iframeDoc) {
																	iframeDoc.execCommand("undo", false);
																}
															}}
															style={{
																padding: "4px 8px",
																fontSize: "11px",
																border: "1px solid #A9A9A9",
																borderRadius: "3px",
																backgroundColor: "#FFFFFF",
																color: "#000000",
																cursor: "pointer",
																display: "flex",
																alignItems: "center",
																justifyContent: "center",
															}}
															title="실행 취소 (Ctrl/Cmd+Z)"
														>
															<Undo2 size={16} color="#000000" />
														</button>
														<button
															onClick={() => {
																const iframeDoc =
																	translationIframeRef.current?.contentDocument;
																if (iframeDoc) {
																	iframeDoc.execCommand("redo", false);
																}
															}}
															style={{
																padding: "4px 8px",
																fontSize: "11px",
																border: "1px solid #A9A9A9",
																borderRadius: "3px",
																backgroundColor: "#FFFFFF",
																color: "#000000",
																cursor: "pointer",
																display: "flex",
																alignItems: "center",
																justifyContent: "center",
															}}
															title="다시 실행 (Ctrl/Cmd+Y)"
														>
															<Redo2 size={16} color="#000000" />
														</button>

														<div
															style={{
																width: "1px",
																height: "20px",
																backgroundColor: "#C0C0C0",
																margin: "0 4px",
															}}
														/>

														<button
															onClick={() => {
																const iframeDoc =
																	translationIframeRef.current?.contentDocument;
																if (iframeDoc)
																	iframeDoc.execCommand("bold", false);
															}}
															style={{
																padding: "4px 8px",
																fontSize: "11px",
																fontWeight: "bold",
																border: "1px solid #A9A9A9",
																borderRadius: "3px",
																backgroundColor: "#FFFFFF",
																color: "#000000",
																cursor: "pointer",
															}}
															title="굵게 (Ctrl+B)"
														>
															B
														</button>
														<button
															onClick={() => {
																const iframeDoc =
																	translationIframeRef.current?.contentDocument;
																if (iframeDoc)
																	iframeDoc.execCommand("italic", false);
															}}
															style={{
																padding: "4px 8px",
																fontSize: "11px",
																fontStyle: "italic",
																border: "1px solid #A9A9A9",
																borderRadius: "3px",
																backgroundColor: "#FFFFFF",
																color: "#000000",
																cursor: "pointer",
															}}
															title="기울임 (Ctrl+I)"
														>
															I
														</button>
														<button
															onClick={() => {
																const iframeDoc =
																	translationIframeRef.current?.contentDocument;
																if (iframeDoc)
																	iframeDoc.execCommand("underline", false);
															}}
															style={{
																padding: "4px 8px",
																fontSize: "11px",
																textDecoration: "underline",
																border: "1px solid #A9A9A9",
																borderRadius: "3px",
																backgroundColor: "#FFFFFF",
																color: "#000000",
																cursor: "pointer",
															}}
															title="밑줄 (Ctrl+U)"
														>
															U
														</button>
														<button
															onClick={() => {
																const iframeDoc =
																	translationIframeRef.current?.contentDocument;
																if (iframeDoc)
																	iframeDoc.execCommand("strikeThrough", false);
															}}
															style={{
																padding: "4px 8px",
																fontSize: "11px",
																textDecoration: "line-through",
																border: "1px solid #A9A9A9",
																borderRadius: "3px",
																backgroundColor: "#FFFFFF",
																color: "#000000",
																cursor: "pointer",
															}}
															title="취소선"
														>
															S
														</button>

														<div
															style={{
																width: "1px",
																height: "20px",
																backgroundColor: "#C0C0C0",
																margin: "0 4px",
															}}
														/>

														<select
															onChange={(e) => {
																const iframeDoc =
																	translationIframeRef.current?.contentDocument;
																if (iframeDoc && e.target.value) {
																	const fontSize = e.target.value;
																	const selection = iframeDoc.getSelection();

																	if (
																		selection &&
																		selection.rangeCount > 0 &&
																		!selection.getRangeAt(0).collapsed
																	) {
																		const range = selection.getRangeAt(0);
																		const selectedText = range.toString();
																		const spanHtml = `<span style="font-size: ${fontSize}pt;">${selectedText}</span>`;
																		try {
																			iframeDoc.execCommand(
																				"insertHTML",
																				false,
																				spanHtml,
																			);
																		} catch (err) {
																			range.deleteContents();
																			const tempDiv =
																				iframeDoc.createElement("div");
																			tempDiv.innerHTML = spanHtml;
																			const fragment =
																				iframeDoc.createDocumentFragment();
																			while (tempDiv.firstChild) {
																				fragment.appendChild(
																					tempDiv.firstChild,
																				);
																			}
																			range.insertNode(fragment);
																			range.setStartAfter(
																				fragment.lastChild ||
																					range.startContainer,
																			);
																			range.collapse(false);
																			selection.removeAllRanges();
																			selection.addRange(range);
																		}
																	}
																	e.target.value = "";
																}
															}}
															style={{
																fontSize: "11px",
																padding: "4px 8px",
																border: "1px solid #A9A9A9",
																borderRadius: "3px",
																backgroundColor: "#FFFFFF",
																color: "#000000",
																cursor: "pointer",
															}}
															title="글자 크기 (pt)"
														>
															<option value="">크기</option>
															<option value="10">10pt</option>
															<option value="12">12pt</option>
															<option value="14">14pt</option>
															<option value="16">16pt</option>
															<option value="18">18pt</option>
															<option value="20">20pt</option>
															<option value="24">24pt</option>
														</select>

														<select
															onChange={(e) => {
																const iframeDoc =
																	translationIframeRef.current?.contentDocument;
																if (iframeDoc && e.target.value) {
																	const lineHeight = e.target.value;
																	const selection = iframeDoc.getSelection();

																	if (selection && selection.rangeCount > 0) {
																		const range = selection.getRangeAt(0);
																		let blockElement: HTMLElement | null = null;

																		if (
																			range.commonAncestorContainer.nodeType ===
																			1
																		) {
																			blockElement = (
																				range.commonAncestorContainer as HTMLElement
																			).closest(
																				"p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre",
																			);
																		} else {
																			blockElement =
																				range.commonAncestorContainer.parentElement?.closest(
																					"p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre",
																				) || null;
																		}

																		if (blockElement) {
																			try {
																				const blockRange =
																					iframeDoc.createRange();
																				blockRange.selectNodeContents(
																					blockElement,
																				);
																				selection.removeAllRanges();
																				selection.addRange(blockRange);

																				const originalHtml =
																					blockElement.innerHTML;
																				const tagName =
																					blockElement.tagName.toLowerCase();
																				const newHtml = `<${tagName} style="line-height: ${lineHeight};">${originalHtml}</${tagName}>`;

																				iframeDoc.execCommand(
																					"insertHTML",
																					false,
																					newHtml,
																				);
																			} catch (err) {
																				blockElement.style.lineHeight =
																					lineHeight;
																			}
																		}
																	}
																	e.target.value = "";
																}
															}}
															style={{
																fontSize: "11px",
																padding: "4px 8px",
																border: "1px solid #A9A9A9",
																borderRadius: "3px",
																backgroundColor: "#FFFFFF",
																color: "#000000",
																cursor: "pointer",
																marginLeft: "4px",
															}}
															title="줄간격"
														>
															<option value="">줄간격</option>
															<option value="1.0">1.0 (단일)</option>
															<option value="1.15">1.15</option>
															<option value="1.5">1.5 (기본)</option>
															<option value="1.75">1.75</option>
															<option value="2.0">2.0 (2배)</option>
															<option value="2.5">2.5</option>
															<option value="3.0">3.0</option>
														</select>
														<div
															style={{
																position: "relative",
																display: "inline-block",
																width: "30px",
																height: "26px",
																marginLeft: "4px",
															}}
														>
															<input
																type="color"
																onChange={(e) => {
																	const iframeDoc =
																		translationIframeRef.current
																			?.contentDocument;
																	if (iframeDoc)
																		iframeDoc.execCommand(
																			"foreColor",
																			false,
																			e.target.value,
																		);
																}}
																style={{
																	position: "absolute",
																	width: "100%",
																	height: "100%",
																	opacity: 0,
																	cursor: "pointer",
																	zIndex: 2,
																}}
																title="글자 색상"
															/>
															<button
																style={{
																	position: "absolute",
																	width: "100%",
																	height: "100%",
																	border: "1px solid #A9A9A9",
																	borderRadius: "3px",
																	backgroundColor: "#FFFFFF",
																	display: "flex",
																	alignItems: "center",
																	justifyContent: "center",
																	cursor: "pointer",
																	padding: 0,
																	pointerEvents: "none",
																}}
																title="글자 색상"
																disabled
															>
																<Palette size={16} color="#000000" />
															</button>
														</div>
														<div
															style={{
																position: "relative",
																display: "inline-block",
																width: "30px",
																height: "26px",
																marginLeft: "4px",
															}}
														>
															<input
																type="color"
																onChange={(e) => {
																	const iframeDoc =
																		translationIframeRef.current
																			?.contentDocument;
																	if (iframeDoc)
																		iframeDoc.execCommand(
																			"backColor",
																			false,
																			e.target.value,
																		);
																}}
																style={{
																	position: "absolute",
																	width: "100%",
																	height: "100%",
																	opacity: 0,
																	cursor: "pointer",
																	zIndex: 2,
																}}
																title="배경 색상"
															/>
															<button
																style={{
																	position: "absolute",
																	width: "100%",
																	height: "100%",
																	border: "1px solid #A9A9A9",
																	borderRadius: "3px",
																	backgroundColor: "#FFFFFF",
																	display: "flex",
																	alignItems: "center",
																	justifyContent: "center",
																	cursor: "pointer",
																	padding: 0,
																	pointerEvents: "none",
																}}
																title="배경 색상"
																disabled
															>
																<Highlighter size={16} color="#000000" />
															</button>
														</div>

														<div
															style={{
																width: "1px",
																height: "20px",
																backgroundColor: "#C0C0C0",
																margin: "0 4px",
															}}
														/>
														<button
															onClick={() => {
																const iframeDoc =
																	translationIframeRef.current?.contentDocument;
																if (iframeDoc)
																	iframeDoc.execCommand("justifyLeft", false);
															}}
															style={{
																padding: "4px 8px",
																fontSize: "11px",
																border: "1px solid #A9A9A9",
																borderRadius: "3px",
																backgroundColor: "#FFFFFF",
																color: "#000000",
																cursor: "pointer",
																display: "flex",
																alignItems: "center",
																justifyContent: "center",
															}}
															title="왼쪽 정렬"
														>
															<AlignLeft size={16} />
														</button>
														<button
															onClick={() => {
																const iframeDoc =
																	translationIframeRef.current?.contentDocument;
																if (iframeDoc)
																	iframeDoc.execCommand("justifyCenter", false);
															}}
															style={{
																padding: "4px 8px",
																fontSize: "11px",
																border: "1px solid #A9A9A9",
																borderRadius: "3px",
																backgroundColor: "#FFFFFF",
																color: "#000000",
																cursor: "pointer",
																display: "flex",
																alignItems: "center",
																justifyContent: "center",
															}}
															title="가운데 정렬"
														>
															<AlignCenter size={16} />
														</button>
														<button
															onClick={() => {
																const iframeDoc =
																	translationIframeRef.current?.contentDocument;
																if (iframeDoc)
																	iframeDoc.execCommand("justifyRight", false);
															}}
															style={{
																padding: "4px 8px",
																fontSize: "11px",
																border: "1px solid #A9A9A9",
																borderRadius: "3px",
																backgroundColor: "#FFFFFF",
																color: "#000000",
																cursor: "pointer",
																display: "flex",
																alignItems: "center",
																justifyContent: "center",
															}}
															title="오른쪽 정렬"
														>
															<AlignRight size={16} />
														</button>
														<div
															style={{
																width: "1px",
																height: "20px",
																backgroundColor: "#C0C0C0",
																margin: "0 4px",
															}}
														/>
														<button
															onClick={() => {
																const iframeDoc =
																	translationIframeRef.current?.contentDocument;
																if (iframeDoc)
																	iframeDoc.execCommand(
																		"insertUnorderedList",
																		false,
																	);
															}}
															style={{
																padding: "4px 8px",
																fontSize: "11px",
																border: "1px solid #A9A9A9",
																borderRadius: "3px",
																backgroundColor: "#FFFFFF",
																color: "#000000",
																cursor: "pointer",
																display: "flex",
																alignItems: "center",
																justifyContent: "center",
															}}
															title="글머리 기호 목록"
														>
															<List size={16} />
														</button>
														<button
															onClick={() => {
																const iframeDoc =
																	translationIframeRef.current?.contentDocument;
																if (iframeDoc)
																	iframeDoc.execCommand(
																		"insertOrderedList",
																		false,
																	);
															}}
															style={{
																padding: "4px 8px",
																fontSize: "11px",
																border: "1px solid #A9A9A9",
																borderRadius: "3px",
																backgroundColor: "#FFFFFF",
																color: "#000000",
																cursor: "pointer",
																display: "flex",
																alignItems: "center",
																justifyContent: "center",
															}}
															title="번호 매기기 목록"
														>
															<ListOrdered size={16} />
														</button>
														<button
															onClick={() => {
																const iframeDoc =
																	translationIframeRef.current?.contentDocument;
																if (iframeDoc) {
																	const url = prompt("링크 URL을 입력하세요:");
																	if (url)
																		iframeDoc.execCommand(
																			"createLink",
																			false,
																			url,
																		);
																}
															}}
															style={{
																padding: "4px 8px",
																fontSize: "11px",
																border: "1px solid #A9A9A9",
																borderRadius: "3px",
																backgroundColor: "#FFFFFF",
																color: "#000000",
																cursor: "pointer",
																display: "flex",
																alignItems: "center",
																justifyContent: "center",
															}}
															title="링크 삽입"
														>
															<Link2 size={16} />
														</button>
														<div
															style={{
																width: "1px",
																height: "20px",
																backgroundColor: "#C0C0C0",
																margin: "0 4px",
															}}
														/>
														<div
															style={{
																position: "relative",
																display: "inline-block",
															}}
														>
															<input
																type="file"
																accept="image/*"
																onChange={(e) => {
																	const file = e.target.files?.[0];
																	if (file) {
																		const reader = new FileReader();
																		reader.onload = (event) => {
																			const imageUrl = event.target
																				?.result as string;
																			const iframeDoc =
																				translationIframeRef.current
																					?.contentDocument;
																			if (iframeDoc && imageUrl) {
																				try {
																					iframeDoc.execCommand(
																						"insertHTML",
																						false,
																						`<img src="${imageUrl}" alt="" style="max-width: 100%; height: auto;" />`,
																					);
																				} catch (err) {
																					const selection =
																						iframeDoc.getSelection();
																					if (
																						selection &&
																						selection.rangeCount > 0
																					) {
																						const range =
																							selection.getRangeAt(0);
																						const img =
																							iframeDoc.createElement("img");
																						img.src = imageUrl;
																						img.alt = "";
																						img.style.maxWidth = "100%";
																						img.style.height = "auto";
																						range.insertNode(img);
																					}
																				}
																			}
																		};
																		reader.readAsDataURL(file);
																	}
																	e.target.value = "";
																}}
																style={{
																	position: "absolute",
																	width: "100%",
																	height: "100%",
																	opacity: 0,
																	cursor: "pointer",
																	zIndex: 2,
																}}
																title="이미지 삽입"
															/>
															<button
																style={{
																	padding: "4px 8px",
																	fontSize: "11px",
																	border: "1px solid #A9A9A9",
																	borderRadius: "3px",
																	backgroundColor: "#FFFFFF",
																	color: "#000000",
																	cursor: "pointer",
																	display: "flex",
																	alignItems: "center",
																	justifyContent: "center",
																	pointerEvents: "none",
																}}
																title="이미지 삽입"
																disabled
															>
																<Image size={16} />
															</button>
														</div>
														<button
															onClick={() => {
																const iframeDoc =
																	translationIframeRef.current?.contentDocument;
																if (iframeDoc) {
																	try {
																		iframeDoc.execCommand(
																			"insertHTML",
																			false,
																			'<pre style="background-color: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto;"><code></code></pre>',
																		);
																	} catch (err) {
																		iframeDoc.execCommand(
																			"formatBlock",
																			false,
																			"pre",
																		);
																	}
																}
															}}
															style={{
																padding: "4px 8px",
																fontSize: "11px",
																border: "1px solid #A9A9A9",
																borderRadius: "3px",
																backgroundColor: "#FFFFFF",
																color: "#000000",
																cursor: "pointer",
																display: "flex",
																alignItems: "center",
																justifyContent: "center",
															}}
															title="코드 블록"
														>
															<Code size={16} />
														</button>
														<div
															style={{
																position: "relative",
																display: "inline-block",
															}}
															data-more-menu
														>
															<button
																onClick={() => setShowMoreMenu(!showMoreMenu)}
																style={{
																	padding: "4px 8px",
																	fontSize: "11px",
																	border: "1px solid #A9A9A9",
																	borderRadius: "3px",
																	backgroundColor: showMoreMenu
																		? "#E0E0E0"
																		: "#FFFFFF",
																	color: "#000000",
																	cursor: "pointer",
																	display: "flex",
																	alignItems: "center",
																	justifyContent: "center",
																}}
																title="더보기"
															>
																<MoreVertical size={16} />
															</button>
															{showMoreMenu && (
																<div
																	style={{
																		position: "absolute",
																		top: "100%",
																		right: 0,
																		marginTop: "4px",
																		backgroundColor: "#FFFFFF",
																		border: "1px solid #A9A9A9",
																		borderRadius: "4px",
																		boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
																		zIndex: 1000,
																		display: "flex",
																		flexDirection: "row",
																		gap: "4px",
																		padding: "4px",
																	}}
																	onClick={(e) => e.stopPropagation()}
																	data-more-menu
																>
																	<button
																		onClick={() => {
																			const iframeDoc =
																				translationIframeRef.current
																					?.contentDocument;
																			if (iframeDoc) {
																				iframeDoc.execCommand(
																					"formatBlock",
																					false,
																					"blockquote",
																				);
																			}
																			setShowMoreMenu(false);
																		}}
																		style={{
																			padding: "4px 8px",
																			fontSize: "11px",
																			border: "1px solid #A9A9A9",
																			borderRadius: "3px",
																			backgroundColor: "#FFFFFF",
																			color: "#000000",
																			cursor: "pointer",
																			display: "flex",
																			alignItems: "center",
																			justifyContent: "center",
																		}}
																		title="인용문"
																	>
																		<Quote size={16} />
																	</button>
																	<button
																		onClick={() => {
																			const iframeDoc =
																				translationIframeRef.current
																					?.contentDocument;
																			if (iframeDoc) {
																				iframeDoc.execCommand(
																					"insertHorizontalRule",
																					false,
																				);
																			}
																			setShowMoreMenu(false);
																		}}
																		style={{
																			padding: "4px 8px",
																			fontSize: "11px",
																			border: "1px solid #A9A9A9",
																			borderRadius: "3px",
																			backgroundColor: "#FFFFFF",
																			color: "#000000",
																			cursor: "pointer",
																			display: "flex",
																			alignItems: "center",
																			justifyContent: "center",
																		}}
																		title="구분선"
																	>
																		<Minus size={16} />
																	</button>
																	<button
																		onClick={() => {
																			const iframeDoc =
																				translationIframeRef.current
																					?.contentDocument;
																			if (iframeDoc) {
																				const rows = prompt(
																					"행 수를 입력하세요 (기본값: 3):",
																					"3",
																				);
																				const cols = prompt(
																					"열 수를 입력하세요 (기본값: 3):",
																					"3",
																				);
																				const rowCount = Number.parseInt(
																					rows || "3",
																					10,
																				);
																				const colCount = Number.parseInt(
																					cols || "3",
																					10,
																				);

																				if (rowCount > 0 && colCount > 0) {
																					let tableHtml =
																						'<table border="1" style="border-collapse: collapse; width: 100%;">';
																					for (let i = 0; i < rowCount; i++) {
																						tableHtml += "<tr>";
																						for (let j = 0; j < colCount; j++) {
																							tableHtml +=
																								'<td style="padding: 8px; border: 1px solid #000;">&nbsp;</td>';
																						}
																						tableHtml += "</tr>";
																					}
																					tableHtml += "</table>";

																					try {
																						iframeDoc.execCommand(
																							"insertHTML",
																							false,
																							tableHtml,
																						);
																					} catch (err) {
																						const selection =
																							iframeDoc.getSelection();
																						if (
																							selection &&
																							selection.rangeCount > 0
																						) {
																							const range =
																								selection.getRangeAt(0);
																							const tempDiv =
																								iframeDoc.createElement("div");
																							tempDiv.innerHTML = tableHtml;
																							const fragment =
																								iframeDoc.createDocumentFragment();
																							while (tempDiv.firstChild) {
																								fragment.appendChild(
																									tempDiv.firstChild,
																								);
																							}
																							range.insertNode(fragment);
																						}
																					}
																				}
																			}
																			setShowMoreMenu(false);
																		}}
																		style={{
																			padding: "4px 8px",
																			fontSize: "11px",
																			border: "1px solid #A9A9A9",
																			borderRadius: "3px",
																			backgroundColor: "#FFFFFF",
																			color: "#000000",
																			cursor: "pointer",
																			display: "flex",
																			alignItems: "center",
																			justifyContent: "center",
																		}}
																		title="표"
																	>
																		<Table size={16} />
																	</button>
																	<button
																		onClick={() => {
																			const iframeDoc =
																				translationIframeRef.current
																					?.contentDocument;
																			if (iframeDoc) {
																				const selection =
																					iframeDoc.getSelection();
																				if (
																					selection &&
																					selection.rangeCount > 0 &&
																					!selection.getRangeAt(0).collapsed
																				) {
																					const range = selection.getRangeAt(0);
																					const selectedText = range.toString();
																					try {
																						iframeDoc.execCommand(
																							"insertHTML",
																							false,
																							`<sup>${selectedText}</sup>`,
																						);
																					} catch (err) {
																						const sup =
																							iframeDoc.createElement("sup");
																						sup.textContent = selectedText;
																						range.deleteContents();
																						range.insertNode(sup);
																					}
																				}
																			}
																			setShowMoreMenu(false);
																		}}
																		style={{
																			padding: "4px 8px",
																			fontSize: "11px",
																			border: "1px solid #A9A9A9",
																			borderRadius: "3px",
																			backgroundColor: "#FFFFFF",
																			color: "#000000",
																			cursor: "pointer",
																			display: "flex",
																			alignItems: "center",
																			justifyContent: "center",
																		}}
																		title="위 첨자"
																	>
																		<Superscript size={16} />
																	</button>
																	<button
																		onClick={() => {
																			const iframeDoc =
																				translationIframeRef.current
																					?.contentDocument;
																			if (iframeDoc) {
																				const selection =
																					iframeDoc.getSelection();
																				if (
																					selection &&
																					selection.rangeCount > 0 &&
																					!selection.getRangeAt(0).collapsed
																				) {
																					const range = selection.getRangeAt(0);
																					const selectedText = range.toString();
																					try {
																						iframeDoc.execCommand(
																							"insertHTML",
																							false,
																							`<sub>${selectedText}</sub>`,
																						);
																					} catch (err) {
																						const sub =
																							iframeDoc.createElement("sub");
																						sub.textContent = selectedText;
																						range.deleteContents();
																						range.insertNode(sub);
																					}
																				}
																			}
																			setShowMoreMenu(false);
																		}}
																		style={{
																			padding: "4px 8px",
																			fontSize: "11px",
																			border: "1px solid #A9A9A9",
																			borderRadius: "3px",
																			backgroundColor: "#FFFFFF",
																			color: "#000000",
																			cursor: "pointer",
																			display: "flex",
																			alignItems: "center",
																			justifyContent: "center",
																		}}
																		title="아래 첨자"
																	>
																		<Subscript size={16} />
																	</button>
																</div>
															)}
														</div>
													</>
												)}

												{/* 컴포넌트 편집 모드 */}
												{editorMode === "component" &&
													selectedElements.length > 0 && (
														<>
															<div
																style={{
																	width: "1px",
																	height: "20px",
																	backgroundColor: "#C0C0C0",
																	margin: "0 4px",
																}}
															/>

															{/* 실행 취소/다시 실행 버튼 */}
															<button
																onClick={() => {
																	const iframeDoc =
																		translationIframeRef.current
																			?.contentDocument;
																	if (!iframeDoc) return;

																	if (undoStackRef.current.length > 0) {
																		redoStackRef.current.push(
																			currentEditorHtmlRef.current,
																		);
																		const previousHtml =
																			undoStackRef.current.pop()!;
																		currentEditorHtmlRef.current = previousHtml;

																		iframeDoc.open();
																		iframeDoc.write(previousHtml);
																		iframeDoc.close();

																		setTranslationHtml(previousHtml);
																		setSelectedElements([]);
																	}
																}}
																style={{
																	padding: "4px 8px",
																	fontSize: "11px",
																	border: "1px solid #A9A9A9",
																	borderRadius: "3px",
																	backgroundColor: "#FFFFFF",
																	color: "#000000",
																	cursor: "pointer",
																	display: "flex",
																	alignItems: "center",
																	justifyContent: "center",
																}}
																title="실행 취소 (Ctrl/Cmd+Z)"
															>
																<Undo2 size={16} color="#000000" />
															</button>
															<button
																onClick={() => {
																	const iframeDoc =
																		translationIframeRef.current
																			?.contentDocument;
																	if (!iframeDoc) return;

																	if (redoStackRef.current.length > 0) {
																		undoStackRef.current.push(
																			currentEditorHtmlRef.current,
																		);
																		const nextHtml =
																			redoStackRef.current.pop()!;
																		currentEditorHtmlRef.current = nextHtml;

																		iframeDoc.open();
																		iframeDoc.write(nextHtml);
																		iframeDoc.close();

																		setTranslationHtml(nextHtml);
																		setSelectedElements([]);
																	}
																}}
																style={{
																	padding: "4px 8px",
																	fontSize: "11px",
																	border: "1px solid #A9A9A9",
																	borderRadius: "3px",
																	backgroundColor: "#FFFFFF",
																	color: "#000000",
																	cursor: "pointer",
																	display: "flex",
																	alignItems: "center",
																	justifyContent: "center",
																}}
																title="다시 실행 (Ctrl/Cmd+Y)"
															>
																<Redo2 size={16} color="#000000" />
															</button>

															<div
																style={{
																	width: "1px",
																	height: "20px",
																	backgroundColor: "#C0C0C0",
																	margin: "0 4px",
																}}
															/>

															<span
																style={{
																	fontSize: "11px",
																	color: "#696969",
																	marginRight: "4px",
																}}
															>
																{selectedElements.length}개 선택됨
															</span>
															<Button
																variant="secondary"
																onClick={() => {
																	if (!translationIframeRef.current) return;
																	const iframeDoc =
																		translationIframeRef.current
																			.contentDocument ||
																		translationIframeRef.current.contentWindow
																			?.document;
																	if (iframeDoc) {
																		selectedElements.forEach((el) => {
																			el.classList.remove("component-selected");
																			el.style.outline = "";
																			el.style.boxShadow = "";
																			el.style.backgroundColor = "";
																			el.style.outlineOffset = "";
																		});
																	}
																	setSelectedElements([]);
																}}
																style={{ fontSize: "11px", padding: "4px 8px" }}
															>
																선택 취소
															</Button>
															<Button
																variant="primary"
																onClick={() => {
																	if (!translationIframeRef.current) return;
																	const iframeDoc =
																		translationIframeRef.current
																			.contentDocument;
																	if (!iframeDoc) return;

																	// Undo Stack에 현재 상태 저장
																	undoStackRef.current.push(
																		currentEditorHtmlRef.current,
																	);
																	redoStackRef.current = [];

																	// 선택된 요소 삭제
																	selectedElements.forEach((el) => el.remove());
																	setSelectedElements([]);

																	// 변경된 HTML 저장
																	const updatedHtml =
																		iframeDoc.documentElement.outerHTML;
																	currentEditorHtmlRef.current = updatedHtml;
																	setTranslationHtml(updatedHtml);
																	console.log(
																		"🗑️ 선택된 요소 삭제:",
																		selectedElements.length,
																		"개",
																	);
																}}
																style={{ fontSize: "11px", padding: "4px 8px" }}
															>
																삭제
															</Button>
														</>
													)}
											</div>
										</div>

										{/* iframe 에디터 */}
										<iframe
											ref={panel.ref as React.RefObject<HTMLIFrameElement>}
											style={{
												width: "100%",
												height: "100%",
												border: "none",
												display: "block",
											}}
											title={panel.title}
										/>
									</>
								) : panel.html ? (
									// 원문, AI 초벌 번역 패널
									<iframe
										ref={panel.ref as React.RefObject<HTMLIFrameElement>}
										srcDoc={panel.html}
										style={{
											width: "100%",
											height: "100%",
											border: "none",
											backgroundColor: "#FFFFFF",
										}}
										title={panel.title}
									/>
								) : (
									<div
										style={{
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											height: "100%",
											color: colors.secondaryText,
											fontSize: "13px",
										}}
									>
										{panel.id === "original"
											? "원문이 없습니다."
											: panel.id === "aiDraft"
												? "AI 초벌 번역이 없습니다."
												: "번역본이 없습니다."}
									</div>
								)}
							</div>
						</div>
					);
				})}
			</div>

			{/* 반려 모달 */}
			{showRejectModal && (
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
					onClick={() => setShowRejectModal(false)}
				>
					<div
						style={{
							backgroundColor: colors.surface,
							padding: "24px",
							borderRadius: "8px",
							width: "500px",
							maxWidth: "90vw",
							border: `1px solid ${colors.border}`,
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<h3
							style={{
								fontSize: "16px",
								fontWeight: 600,
								marginBottom: "16px",
							}}
						>
							문서 반려
						</h3>

						<div style={{ marginBottom: "16px" }}>
							<label
								style={{
									display: "block",
									fontSize: "13px",
									marginBottom: "8px",
									color: colors.primaryText,
								}}
							>
								반려 사유 *
							</label>
							<textarea
								value={rejectMessage}
								onChange={(e) => setRejectMessage(e.target.value)}
								placeholder="예: 번역 품질이 부족합니다. 전문 용어 번역이 정확하지 않습니다."
								style={{
									width: "100%",
									minHeight: "120px",
									padding: "8px",
									border: `1px solid ${colors.border}`,
									borderRadius: "4px",
									fontSize: "13px",
									fontFamily: "inherit",
									resize: "vertical",
								}}
							/>
							<div
								style={{
									fontSize: "12px",
									color: colors.secondaryText,
									marginTop: "8px",
								}}
							>
								반려 시 문서가 다시 번역 대기 상태로 변경됩니다.
							</div>
						</div>

						<div
							style={{
								display: "flex",
								gap: "8px",
								justifyContent: "flex-end",
							}}
						>
							<Button
								variant="secondary"
								onClick={() => {
									setShowRejectModal(false);
									setRejectMessage("");
								}}
								style={{ fontSize: "12px" }}
							>
								취소
							</Button>
							<Button
								variant="primary"
								onClick={handleReject}
								style={{ fontSize: "12px" }}
							>
								반려 처리
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* 링크 편집 모달 */}
			{showLinkModal && (
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
						setShowLinkModal(false);
						setEditingLink(null);
						setLinkUrl("");
					}}
				>
					<div
						style={{
							backgroundColor: colors.surface,
							padding: "24px",
							borderRadius: "8px",
							width: "400px",
							maxWidth: "90vw",
							border: `1px solid ${colors.border}`,
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<h3
							style={{
								fontSize: "16px",
								fontWeight: 600,
								marginBottom: "16px",
							}}
						>
							링크 편집
						</h3>

						<div style={{ marginBottom: "16px" }}>
							<label
								style={{
									display: "block",
									fontSize: "13px",
									marginBottom: "8px",
									color: colors.primaryText,
								}}
							>
								URL
							</label>
							<input
								type="text"
								value={linkUrl}
								onChange={(e) => setLinkUrl(e.target.value)}
								placeholder="https://example.com"
								style={{
									width: "100%",
									padding: "8px",
									border: `1px solid ${colors.border}`,
									borderRadius: "4px",
									fontSize: "13px",
									fontFamily: "inherit",
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										const iframeDoc =
											translationIframeRef.current?.contentDocument;
										if (iframeDoc && editingLink && linkUrl.trim()) {
											const selection = iframeDoc.getSelection();
											if (selection) {
												const range = iframeDoc.createRange();
												range.selectNodeContents(editingLink);
												selection.removeAllRanges();
												selection.addRange(range);

												iframeDoc.execCommand("unlink", false);
												iframeDoc.execCommand(
													"createLink",
													false,
													linkUrl.trim(),
												);
											}
										}
										setShowLinkModal(false);
										setEditingLink(null);
										setLinkUrl("");
									}
								}}
								autoFocus
							/>
						</div>

						<div
							style={{
								display: "flex",
								gap: "8px",
								justifyContent: "flex-end",
							}}
						>
							<Button
								variant="secondary"
								onClick={() => {
									setShowLinkModal(false);
									setEditingLink(null);
									setLinkUrl("");
								}}
								style={{ fontSize: "12px" }}
							>
								취소
							</Button>
							<Button
								variant="secondary"
								onClick={() => {
									const iframeDoc =
										translationIframeRef.current?.contentDocument;
									if (iframeDoc && editingLink) {
										const selection = iframeDoc.getSelection();
										if (selection) {
											const range = iframeDoc.createRange();
											range.selectNodeContents(editingLink);
											selection.removeAllRanges();
											selection.addRange(range);
											iframeDoc.execCommand("unlink", false);
										}
									}
									setShowLinkModal(false);
									setEditingLink(null);
									setLinkUrl("");
								}}
								style={{ fontSize: "12px" }}
							>
								삭제
							</Button>
							<Button
								variant="primary"
								onClick={() => {
									const iframeDoc =
										translationIframeRef.current?.contentDocument;
									if (iframeDoc && editingLink && linkUrl.trim()) {
										const selection = iframeDoc.getSelection();
										if (selection) {
											const range = iframeDoc.createRange();
											range.selectNodeContents(editingLink);
											selection.removeAllRanges();
											selection.addRange(range);

											iframeDoc.execCommand("unlink", false);
											iframeDoc.execCommand(
												"createLink",
												false,
												linkUrl.trim(),
											);
										}
									}
									setShowLinkModal(false);
									setEditingLink(null);
									setLinkUrl("");
								}}
								style={{ fontSize: "12px" }}
							>
								저장
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
