import React, { useState, useEffect, useRef, useCallback } from 'react';
import { documentApi, DocumentCommentResponse } from '../services/documentApi';
import { useUser } from '../contexts/UserContext';
import { Send, Trash2, MessageSquare, RefreshCw } from 'lucide-react';

interface DocumentChatProps {
  documentId: number;
  /** 채팅 패널 높이 (기본 400px) */
  height?: number | string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getInitial(name: string): string {
  return name ? name.charAt(0).toUpperCase() : '?';
}

const AVATAR_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#06B6D4', '#F97316', '#EC4899',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export const DocumentChat: React.FC<DocumentChatProps> = ({ documentId, height = 400 }) => {
  const { user } = useUser();
  const [comments, setComments] = useState<DocumentCommentResponse[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchComments = useCallback(async () => {
    try {
      const data = await documentApi.getDocumentComments(documentId);
      setComments(data);
      setError(null);
    } catch (e: any) {
      setError('댓글을 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // 새 댓글 도착 시 스크롤 하단으로
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [comments]);

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const newComment = await documentApi.addDocumentComment(documentId, trimmed);
      setComments(prev => [...prev, newComment]);
      setInputValue('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (e: any) {
      alert('댓글 전송에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (commentId: number) => {
    if (!window.confirm('댓글을 삭제하시겠습니까?')) return;
    setDeletingId(commentId);
    try {
      await documentApi.deleteDocumentComment(documentId, commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (e: any) {
      alert('삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    // 자동 높이 조절
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const isMyComment = (comment: DocumentCommentResponse) =>
    user?.id === comment.authorId;

  const canDelete = (comment: DocumentCommentResponse) =>
    user?.id === comment.authorId ||
    (user?.roleLevel !== undefined && user.roleLevel <= 2);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: typeof height === 'number' ? `${height}px` : height,
        backgroundColor: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: '8px',
        overflow: 'hidden',
        fontFamily: 'system-ui, Pretendard, sans-serif',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid #E5E7EB',
          backgroundColor: '#F9FAFB',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MessageSquare size={16} color="#6B7280" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
            소통 채팅
          </span>
          {comments.length > 0 && (
            <span
              style={{
                fontSize: '11px',
                color: '#6B7280',
                backgroundColor: '#E5E7EB',
                borderRadius: '10px',
                padding: '1px 7px',
              }}
            >
              {comments.length}
            </span>
          )}
        </div>
        <button
          onClick={fetchComments}
          title="새로고침"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            color: '#9CA3AF',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* 메시지 영역 */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {loading && (
          <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '13px', padding: '20px 0' }}>
            불러오는 중...
          </div>
        )}
        {!loading && error && (
          <div style={{ textAlign: 'center', color: '#EF4444', fontSize: '13px', padding: '20px 0' }}>
            {error}
          </div>
        )}
        {!loading && !error && comments.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: '#9CA3AF',
              fontSize: '13px',
              padding: '24px 0',
              lineHeight: '1.6',
            }}
          >
            아직 댓글이 없습니다.
            <br />
            팀원들과 이 문서에 대해 소통해보세요.
          </div>
        )}
        {comments.map(comment => {
          const mine = isMyComment(comment);
          return (
            <div
              key={comment.id}
              style={{
                display: 'flex',
                flexDirection: mine ? 'row-reverse' : 'row',
                alignItems: 'flex-end',
                gap: '8px',
              }}
            >
              {/* 아바타 (상대방만) */}
              {!mine && (
                <div
                  title={comment.authorName}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: avatarColor(comment.authorName),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 700,
                    flexShrink: 0,
                    overflow: 'hidden',
                  }}
                >
                  {comment.authorProfileImage ? (
                    <img
                      src={comment.authorProfileImage}
                      alt={comment.authorName}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    getInitial(comment.authorName)
                  )}
                </div>
              )}

              {/* 말풍선 + 메타 */}
              <div
                style={{
                  maxWidth: '75%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: mine ? 'flex-end' : 'flex-start',
                  gap: '3px',
                }}
              >
                {/* 이름 (상대방만) */}
                {!mine && (
                  <span style={{ fontSize: '11px', color: '#6B7280', paddingLeft: '2px' }}>
                    {comment.authorName}
                  </span>
                )}

                {/* 말풍선 + 삭제 버튼 */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', flexDirection: mine ? 'row-reverse' : 'row' }}>
                  <div
                    style={{
                      padding: '9px 13px',
                      borderRadius: mine ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                      backgroundColor: mine ? '#3B82F6' : '#F3F4F6',
                      color: mine ? '#FFFFFF' : '#111827',
                      fontSize: '13px',
                      lineHeight: '1.55',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {comment.content}
                  </div>
                  {canDelete(comment) && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      disabled={deletingId === comment.id}
                      title="삭제"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        color: '#D1D5DB',
                        display: 'flex',
                        alignItems: 'center',
                        flexShrink: 0,
                        marginTop: '4px',
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {/* 시간 */}
                <span style={{ fontSize: '10px', color: '#9CA3AF', paddingLeft: mine ? 0 : '2px', paddingRight: mine ? '2px' : 0 }}>
                  {formatDate(comment.createdAt)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 입력창 */}
      <div
        style={{
          padding: '10px 12px',
          borderTop: '1px solid #E5E7EB',
          backgroundColor: '#F9FAFB',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #D1D5DB',
            borderRadius: '10px',
            padding: '8px 10px',
          }}
        >
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요 (Enter: 전송, Shift+Enter: 줄바꿈)"
            rows={1}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: '13px',
              fontFamily: 'system-ui, Pretendard, sans-serif',
              lineHeight: '1.5',
              backgroundColor: 'transparent',
              color: '#111827',
              overflowY: 'auto',
              maxHeight: '120px',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || sending}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: inputValue.trim() && !sending ? '#3B82F6' : '#E5E7EB',
              color: inputValue.trim() && !sending ? '#FFFFFF' : '#9CA3AF',
              cursor: inputValue.trim() && !sending ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background-color 0.15s',
            }}
          >
            <Send size={15} />
          </button>
        </div>
        <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px', textAlign: 'right' }}>
          Enter로 전송 · Shift+Enter로 줄바꿈
        </div>
      </div>
    </div>
  );
};

export default DocumentChat;
