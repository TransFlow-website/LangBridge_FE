import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { colors, typography } from '../constants/designTokens';
import { Button } from '../components/Button';
import { inquiryApi } from '../services/inquiryApi';
import type { InquirySummary } from '../services/inquiryApi';
import { useUser } from '../contexts/UserContext';
import { useInquiryBadge } from '../hooks/useInquiryBadge';
function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function InquiryList() {
  const navigate = useNavigate();
  const { user, loading: userLoading } = useUser();
  const { displayCount: inquiryBadgeCount } = useInquiryBadge(
    user?.role ?? null,
    user?.id ?? null,
    userLoading
  );
  const [mineOnly, setMineOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<InquirySummary[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await inquiryApi.list({ page, size: 20, mine: mineOnly });
        setItems(res.content ?? []);
        setTotalPages(res.totalPages ?? 0);
      } catch (e) {
        setError('목록을 불러오지 못했습니다.');
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [page, mineOnly]);

  return (
    <div
      className="min-h-full p-6 md:p-8"
      style={{ backgroundColor: colors.primaryBackground, color: colors.primaryText }}
    >
      <div className="mx-auto px-[2vw] sm:px-0" style={{ width: 'min(92vw, 56rem)', maxWidth: '100%' }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-xl font-semibold flex items-center gap-2" style={{ fontFamily: typography.fontFamily }}>
            문의 게시판
            {inquiryBadgeCount > 0 && (
              <span
                className="min-w-[20px] h-5 px-1 rounded-full inline-flex items-center justify-center text-[11px] font-bold text-white"
                style={{ backgroundColor: '#dc2626' }}
                title="읽지 않은 문의 알림"
                aria-label={`읽지 않은 문의 ${inquiryBadgeCount}건`}
              >
                {inquiryBadgeCount > 99 ? '99+' : inquiryBadgeCount}
              </span>
            )}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex items-center rounded-xl border p-1"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <button
                type="button"
                onClick={() => {
                  setMineOnly(false);
                  setPage(0);
                }}
                aria-pressed={!mineOnly}
                className={`px-4 py-2 text-sm rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  !mineOnly ? 'shadow-sm' : 'text-gray-600 hover:bg-white/60'
                }`}
                style={{
                  backgroundColor: !mineOnly ? 'rgba(59, 130, 246, 0.16)' : 'transparent',
                  color: !mineOnly ? '#1d4ed8' : '#4b5563',
                  fontFamily: typography.fontFamily,
                }}
              >
                전체
              </button>
              <button
                type="button"
                onClick={() => {
                  setMineOnly(true);
                  setPage(0);
                }}
                aria-pressed={mineOnly}
                className={`px-4 py-2 text-sm rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  mineOnly ? 'shadow-sm' : 'text-gray-600 hover:bg-white/60'
                }`}
                style={{
                  backgroundColor: mineOnly ? 'rgba(59, 130, 246, 0.16)' : 'transparent',
                  color: mineOnly ? '#1d4ed8' : '#4b5563',
                  fontFamily: typography.fontFamily,
                }}
              >
                내 문의
              </button>
            </div>
            <Button variant="primary" onClick={() => navigate('/inquiries/new')}>
              문의 작성
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-sm mb-4" style={{ color: '#b91c1c' }}>
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm" style={{ color: colors.secondaryText }}>
            불러오는 중…
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm" style={{ color: colors.secondaryText }}>
            등록된 문의가 없습니다.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((row) => (
              <li key={row.id}>
                {/*
                  unreadReplyCount를 아직 내려주지 않는 백엔드(재시작 전)에서도
                  "내 문의 + 답변 있음"이면 확인 필요 배지를 보여주는 폴백.
                */}
                {(() => {
                  const isMyInquiry = user != null && row.author.id === user.id;
                  const unread = row.unreadReplyCount ?? 0;
                  const showFallbackUnread = isMyInquiry && row.hasAdminReply && row.unreadReplyCount == null;
                  const showUnreadBadge = unread > 0 || showFallbackUnread;
                  const unreadLabel = unread > 1 ? `미읽음 ${unread}` : '미읽음';
                  return (
                <Link
                  to={`/inquiries/${row.id}`}
                  className="block rounded-lg border p-4 transition-colors hover:bg-[rgba(192,192,192,0.15)]"
                  style={{ borderColor: colors.border, backgroundColor: colors.surface }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div>
                      <span className="font-medium">{row.title}</span>
                      <div
                        className="text-sm mt-1"
                        style={{ color: colors.secondaryText }}
                      >
                        {row.author.name} · {formatDate(row.createdAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {showUnreadBadge && (
                        <span
                          className="text-xs px-2 py-0.5 rounded font-medium"
                          style={{ backgroundColor: 'rgba(220,38,38,0.15)', color: '#b91c1c' }}
                          title={
                            showFallbackUnread
                              ? '답변이 있어 확인이 필요합니다. (서버 재시작 후 미읽음 개수로 표시)'
                              : '읽지 않은 관리자 답변이 있습니다.'
                          }
                        >
                          {unreadLabel}
                        </span>
                      )}
                      {row.hasAdminReply ? (
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#166534' }}
                        >
                          답변 있음
                        </span>
                      ) : (
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{ backgroundColor: 'rgba(234,179,8,0.2)', color: '#854d0e' }}
                        >
                          답변 대기
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
                  );
                })()}
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            <Button
              variant="secondary"
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              이전
            </Button>
            <span className="self-center text-sm" style={{ color: colors.secondaryText }}>
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="secondary"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
