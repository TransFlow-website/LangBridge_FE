import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { colors } from '../constants/designTokens';

const sortBtnIconMuted = '#94a3b8';
const sortBtnIconActive = '#1e293b';

export interface TableColumn<T> {
  key: string;
  label: string;
  width?: string;
  render: (item: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  /** 헤더 클릭 정렬용 키 (onColumnSort와 함께 사용) */
  sortKey?: string;
  /** 헤더 셀 래퍼에 합침 (열 사이만 좁히려면 음수 marginLeft 등) */
  headerCellStyle?: React.CSSProperties;
  /** 본문 셀 래퍼에 합침 */
  cellStyle?: React.CSSProperties;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  onRowClick?: (item: T, index: number) => void;
  emptyMessage?: string;
  /** 행별 스타일 (예: 원본/복사본 배경 구분) */
  getRowStyle?: (item: T, index: number) => React.CSSProperties;
  /** 행별 호버 시 배경색 (미지정 시 #F5F5F5) - 토글된 행 등 구분용 */
  getRowHoverStyle?: (item: T, index: number) => React.CSSProperties | undefined;
  /** sortKey가 있는 열 헤더 클릭 시 (같은 열 재클릭 시 오름↔내림) */
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  onColumnSort?: (sortKey: string) => void;
  /** true면 행에 포인터 커서·호버 배경 강조 없음 */
  plainRowStyle?: boolean;
  /** true면 셀·열 gap·패딩을 줄여 한 화면에 더 많이 보이게 함 */
  compact?: boolean;
  /** 열 사이 간격 (예: '0.25rem'). 지정 시 compact보다 우선 */
  columnGap?: string;
  /** 헤더 행 패딩. 지정 시 compact 기본값 무시 */
  headerPadding?: string;
  /** 데이터 행 패딩. 지정 시 compact 기본값 무시 */
  rowPadding?: string;
}

export function Table<T extends { id: number | string }>({
  columns,
  data,
  onRowClick,
  emptyMessage = '데이터가 없습니다.',
  getRowStyle,
  getRowHoverStyle,
  sortField,
  sortOrder,
  onColumnSort,
  plainRowStyle = false,
  compact = false,
  columnGap: columnGapProp,
  headerPadding: headerPaddingProp,
  rowPadding: rowPaddingProp,
}: TableProps<T>) {
  const gridTemplateColumns = columns.map((col) => col.width || '1fr').join(' ');
  const cellGap =
    columnGapProp ?? (compact ? '1px' : '0.5rem');
  const headerPadding =
    headerPaddingProp ?? (compact ? '0.3125rem 0.5rem' : '0.75rem 1rem');
  const rowPadding =
    rowPaddingProp ?? (compact ? '0.3125rem 0.5rem' : '1rem');
  const compactFont = compact ? '0.75rem' : '0.8125rem';

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      <style>{`
        .lb-table-sort-btn {
          -webkit-tap-highlight-color: transparent;
        }
        .lb-table-sort-btn:focus,
        .lb-table-sort-btn:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }
      `}</style>
      {/* 가로 스크롤. 안쪽 래퍼는 최소 100% 너비로 그리드가 좁아도 헤더 배경·행 선이 카드 끝까지 이어짐 */}
      <div
        style={{
          width: '100%',
          minWidth: 0,
          maxWidth: '100%',
          boxSizing: 'border-box',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {data.length === 0 ? (
          <div
            style={{
              minWidth: '100%',
              boxSizing: 'border-box',
              padding: '3rem 1rem',
              textAlign: 'center',
              color: colors.primaryText,
              fontSize: '0.8125rem',
            }}
          >
            {emptyMessage}
          </div>
        ) : (
        <div
          style={{
            display: 'inline-block',
            minWidth: '100%',
            width: 'max-content',
            verticalAlign: 'top',
            boxSizing: 'border-box',
          }}
        >
        {/* 테이블 헤더 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns,
            backgroundColor: colors.sidebarBackground,
            borderBottom: `1px solid ${colors.border}`,
            padding: headerPadding,
            fontWeight: 600,
            fontSize: compactFont,
            color: '#000000',
            gap: cellGap,
            boxSizing: 'border-box',
          }}
        >
          {columns.map((col) => {
            const align = col.align || 'left';
            const justify =
              align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';
            const sortActive = sortField === col.sortKey;
            const sortIcon =
              sortActive && sortOrder === 'asc' ? (
                <ArrowUp
                  size={15}
                  strokeWidth={2}
                  color={sortBtnIconActive}
                  aria-hidden
                  style={{ flexShrink: 0, opacity: 0.92 }}
                />
              ) : sortActive && sortOrder === 'desc' ? (
                <ArrowDown
                  size={15}
                  strokeWidth={2}
                  color={sortBtnIconActive}
                  aria-hidden
                  style={{ flexShrink: 0, opacity: 0.92 }}
                />
              ) : (
                <ArrowUpDown
                  size={15}
                  strokeWidth={1.75}
                  color={sortBtnIconMuted}
                  aria-hidden
                  style={{ flexShrink: 0, opacity: 0.75 }}
                />
              );

            const headerContent =
              col.sortKey && onColumnSort ? (
                <button
                  type="button"
                  className="lb-table-sort-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (col.sortKey) onColumnSort(col.sortKey);
                  }}
                  title={
                    sortField === col.sortKey
                      ? sortOrder === 'asc'
                        ? '오름차순 · 클릭하면 내림차순'
                        : '내림차순 · 클릭하면 오름차순'
                      : '클릭하면 오름차순'
                  }
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'transparent',
                    border: 'none',
                    padding: '2px 0',
                    margin: 0,
                    cursor: plainRowStyle ? 'default' : 'pointer',
                    font: 'inherit',
                    fontWeight: 600,
                    color: '#000000',
                    justifyContent: justify,
                    width: align === 'right' ? '100%' : 'auto',
                    minWidth: 0,
                    outline: 'none',
                    boxShadow: 'none',
                    borderRadius: '2px',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ minWidth: 0, textAlign: align }}>{col.label}</span>
                  {sortIcon}
                </button>
              ) : (
                col.label
              );
            return (
              <div
                key={col.key}
                style={{
                  textAlign: align,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: justify,
                  minWidth: 0,
                  ...col.headerCellStyle,
                }}
              >
                {headerContent}
              </div>
            );
          })}
        </div>

        {/* 테이블 본문 */}
        <div>
            {data.map((item, index) => (
              <div
                key={item.id}
                onClick={() => onRowClick?.(item, index)}
                style={{
                  display: 'grid',
                  gridTemplateColumns,
                  padding: rowPadding,
                  borderBottom: `1px solid ${colors.border}`,
                  fontSize: compactFont,
                  color: '#000000',
                  cursor: plainRowStyle ? 'default' : onRowClick ? 'pointer' : 'default',
                  transition: plainRowStyle ? undefined : 'background-color 150ms',
                  backgroundColor: colors.surface,
                  gap: cellGap,
                  alignItems: 'center',
                  boxSizing: 'border-box',
                  ...getRowStyle?.(item, index),
                }}
                onMouseEnter={
                  plainRowStyle
                    ? undefined
                    : (e) => {
                        if (onRowClick) {
                          const hoverBg = getRowHoverStyle?.(item, index)?.backgroundColor;
                          e.currentTarget.style.backgroundColor =
                            typeof hoverBg === 'string' ? hoverBg : '#F5F5F5';
                        }
                      }
                }
                onMouseLeave={
                  plainRowStyle
                    ? undefined
                    : (e) => {
                        const base = getRowStyle?.(item, index)?.backgroundColor;
                        e.currentTarget.style.backgroundColor =
                          typeof base === 'string' ? base : colors.surface;
                      }
                }
              >
                {columns.map((col) => {
                  const ca = col.align || 'left';
                  return (
                    <div
                      key={col.key}
                      style={{
                        textAlign: ca,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent:
                          ca === 'right' ? 'flex-end' : ca === 'center' ? 'center' : 'flex-start',
                        minWidth: 0,
                        overflow: 'hidden',
                        ...col.cellStyle,
                      }}
                    >
                      {col.render(item, index)}
                    </div>
                  );
                })}
              </div>
            ))}
        </div>
        </div>
        )}
      </div>
    </div>
  );
}
