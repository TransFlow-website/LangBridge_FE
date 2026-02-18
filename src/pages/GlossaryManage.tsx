import React, { useState, useEffect, useMemo } from 'react';
import { Table, TableColumn } from '../components/Table';
import { colors } from '../constants/designTokens';
import { termApi, TermDictionaryResponse, CreateTermRequest, UpdateTermRequest, BatchCreateTermRequest } from '../services/termApi';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { useUser } from '../contexts/UserContext';
import { UserRole } from '../types/user';

const languageOptions = [
  { value: 'EN', label: '영어' },
  { value: 'KO', label: '한국어' },
  { value: 'JA', label: '일본어' },
  { value: 'ZH', label: '중국어' },
  { value: 'ES', label: '스페인어' },
  { value: 'FR', label: '프랑스어' },
  { value: 'DE', label: '독일어' },
];

export default function GlossaryManage() {
  const { user } = useUser();
  const [terms, setTerms] = useState<TermDictionaryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSourceLang, setSelectedSourceLang] = useState<string>('');
  const [selectedTargetLang, setSelectedTargetLang] = useState<string>('');
  
  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  
  // 모달 상태
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBatchAddModalOpen, setIsBatchAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState<TermDictionaryResponse | null>(null);
  
  // 폼 상태
  const [formData, setFormData] = useState<CreateTermRequest>({
    sourceTerm: '',
    targetTerm: '',
    sourceLang: 'EN',
    targetLang: 'KO',
    description: '',
  });
  
  // 대량 추가 폼 상태
  const [batchFormData, setBatchFormData] = useState<BatchCreateTermRequest>({
    sourceLang: 'EN',
    targetLang: 'KO',
    termsText: '',
  });

  const isAdmin = user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN;

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        setLoading(true);
        const params: { sourceLang?: string; targetLang?: string; page?: number; size?: number } = {};
        if (selectedSourceLang) params.sourceLang = selectedSourceLang;
        if (selectedTargetLang) params.targetLang = selectedTargetLang;
        params.page = currentPage;
        params.size = pageSize;
        const response = await termApi.getAllTerms(params);
        setTerms(response.content);
        setTotalPages(response.totalPages);
        setTotalElements(response.totalElements);
      } catch (error) {
        console.error('용어 목록 조회 실패:', error);
        setTerms([]);
        setTotalPages(0);
        setTotalElements(0);
      } finally {
        setLoading(false);
      }
    };

    fetchTerms();
  }, [selectedSourceLang, selectedTargetLang, currentPage, pageSize]);

  // 검색은 클라이언트 사이드에서 수행 (현재 페이지의 데이터만 검색)
  const filteredTerms = useMemo(() => {
    if (!searchTerm.trim()) return terms;
    const term = searchTerm.toLowerCase();
    return terms.filter(
      (t) =>
        t.sourceTerm.toLowerCase().includes(term) ||
        t.targetTerm.toLowerCase().includes(term) ||
        (t.description && t.description.toLowerCase().includes(term)) ||
        (t.category && t.category.toLowerCase().includes(term)) ||
        (t.articleTitle && t.articleTitle.toLowerCase().includes(term))
    );
  }, [terms, searchTerm]);
  
  // 언어 필터 변경 시 첫 페이지로 이동
  useEffect(() => {
    setCurrentPage(0);
  }, [selectedSourceLang, selectedTargetLang]);

  const handleAddClick = () => {
    setFormData({
      sourceTerm: '',
      targetTerm: '',
      sourceLang: 'EN',
      targetLang: 'KO',
      description: '',
    });
    setIsAddModalOpen(true);
  };

  const handleBatchAddClick = () => {
    setBatchFormData({
      sourceLang: 'EN',
      targetLang: 'KO',
      termsText: '',
    });
    setIsBatchAddModalOpen(true);
  };

  const handleEditClick = (term: TermDictionaryResponse) => {
    setSelectedTerm(term);
    setFormData({
      sourceTerm: term.sourceTerm,
      targetTerm: term.targetTerm,
      sourceLang: term.sourceLang,
      targetLang: term.targetLang,
      description: term.description || '',
    });
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = (term: TermDictionaryResponse) => {
    setSelectedTerm(term);
    setIsDeleteModalOpen(true);
  };

  const handleAddConfirm = async () => {
    try {
      const createResponse = await termApi.createTerm(formData);
      setIsAddModalOpen(false);
      setFormData({
        sourceTerm: '',
        targetTerm: '',
        sourceLang: 'EN',
        targetLang: 'KO',
        description: '',
      });
      // 목록 새로고침
      const params: { sourceLang?: string; targetLang?: string; page?: number; size?: number } = {};
      if (selectedSourceLang) params.sourceLang = selectedSourceLang;
      if (selectedTargetLang) params.targetLang = selectedTargetLang;
      params.page = currentPage;
      params.size = pageSize;
      const pageResponse = await termApi.getAllTerms(params);
      setTerms(pageResponse.content);
      setTotalPages(pageResponse.totalPages);
      setTotalElements(pageResponse.totalElements);
      
      // DeepL 연동 상태에 따른 메시지
      if (createResponse.deeplGlossaryId) {
        alert(`용어가 추가되었습니다.\n\nDeepL 연동: 성공\nGlossary ID: ${createResponse.deeplGlossaryId.substring(0, 8)}...`);
      } else {
        alert('용어가 추가되었습니다.\n\nDeepL 연동: 대기 중 (잠시 후 자동으로 연동됩니다)');
      }
    } catch (error) {
      console.error('용어 추가 실패:', error);
      alert('용어 추가에 실패했습니다.');
    }
  };

  const handleEditConfirm = async () => {
    if (!selectedTerm) return;
    try {
      const updateResponse = await termApi.updateTerm(selectedTerm.id, formData);
      setIsEditModalOpen(false);
      setSelectedTerm(null);
      // 목록 새로고침
      const params: { sourceLang?: string; targetLang?: string; page?: number; size?: number } = {};
      if (selectedSourceLang) params.sourceLang = selectedSourceLang;
      if (selectedTargetLang) params.targetLang = selectedTargetLang;
      params.page = currentPage;
      params.size = pageSize;
      const pageResponse = await termApi.getAllTerms(params);
      setTerms(pageResponse.content);
      setTotalPages(pageResponse.totalPages);
      setTotalElements(pageResponse.totalElements);
      
      // DeepL 연동 상태에 따른 메시지
      if (updateResponse.deeplGlossaryId) {
        alert(`용어가 수정되었습니다.\n\nDeepL 연동: 성공\nGlossary ID: ${updateResponse.deeplGlossaryId.substring(0, 8)}...`);
      } else {
        alert('용어가 수정되었습니다.\n\nDeepL 연동: 대기 중 (잠시 후 자동으로 연동됩니다)');
      }
    } catch (error) {
      console.error('용어 수정 실패:', error);
      alert('용어 수정에 실패했습니다.');
    }
  };

  const handleBatchAddConfirm = async () => {
    if (!batchFormData.termsText.trim()) {
      alert('용어 목록을 입력해주세요.');
      return;
    }
    
    try {
      const batchResponse = await termApi.createTermsBatch(batchFormData);
      setIsBatchAddModalOpen(false);
      setBatchFormData({
        sourceLang: 'EN',
        targetLang: 'KO',
        termsText: '',
      });
      
      // 목록 새로고침
      const params: { sourceLang?: string; targetLang?: string; page?: number; size?: number } = {};
      if (selectedSourceLang) params.sourceLang = selectedSourceLang;
      if (selectedTargetLang) params.targetLang = selectedTargetLang;
      params.page = currentPage;
      params.size = pageSize;
      const pageResponse = await termApi.getAllTerms(params);
      setTerms(pageResponse.content);
      setTotalPages(pageResponse.totalPages);
      setTotalElements(pageResponse.totalElements);
      
      // 결과 메시지 표시
      if (batchResponse.failedCount === 0) {
        alert(`모든 용어가 성공적으로 추가되었습니다.\n\n성공: ${batchResponse.successCount}개`);
      } else {
        const errorMsg = batchResponse.errors.length > 0 
          ? `\n\n오류:\n${batchResponse.errors.slice(0, 5).join('\n')}${batchResponse.errors.length > 5 ? `\n... 외 ${batchResponse.errors.length - 5}개 오류` : ''}`
          : '';
        alert(`용어 추가가 완료되었습니다.\n\n성공: ${batchResponse.successCount}개\n실패: ${batchResponse.failedCount}개${errorMsg}`);
      }
    } catch (error) {
      console.error('대량 용어 추가 실패:', error);
      alert('대량 용어 추가에 실패했습니다.');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedTerm) return;
    try {
      await termApi.deleteTerm(selectedTerm.id);
      setIsDeleteModalOpen(false);
      setSelectedTerm(null);
      // 목록 새로고침
      const params: { sourceLang?: string; targetLang?: string; page?: number; size?: number } = {};
      if (selectedSourceLang) params.sourceLang = selectedSourceLang;
      if (selectedTargetLang) params.targetLang = selectedTargetLang;
      params.page = currentPage;
      params.size = pageSize;
      const response = await termApi.getAllTerms(params);
      setTerms(response.content);
      setTotalPages(response.totalPages);
      setTotalElements(response.totalElements);
      alert('용어가 삭제되었습니다.');
    } catch (error) {
      console.error('용어 삭제 실패:', error);
      alert('용어 삭제에 실패했습니다.');
    }
  };

  const columns: TableColumn<TermDictionaryResponse>[] = [
    {
      key: 'sourceTerm',
      label: '원문 용어',
      width: '20%',
      render: (item) => (
        <span style={{ fontWeight: 500, color: '#000000' }}>{item.sourceTerm}</span>
      ),
    },
    {
      key: 'targetTerm',
      label: '번역 용어',
      width: '20%',
      render: (item) => (
        <span style={{ fontWeight: 500, color: '#000000' }}>{item.targetTerm}</span>
      ),
    },
    {
      key: 'languages',
      label: '언어',
      width: '10%',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {item.sourceLang} → {item.targetLang}
        </span>
      ),
    },
    {
      key: 'description',
      label: '설명',
      width: '20%',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {item.description || '-'}
        </span>
      ),
    },
    {
      key: 'deeplStatus',
      label: 'DeepL 연동',
      width: '12%',
      render: (item) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {item.deeplGlossaryId ? (
            <>
              <span style={{ 
                color: '#28a745', 
                fontSize: '12px',
                fontWeight: 500 
              }}>
                ✓ 연동됨
              </span>
              <span 
                style={{ 
                  color: colors.primaryText, 
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  cursor: 'help'
                }} 
                title={item.deeplGlossaryId}
              >
                {item.deeplGlossaryId.substring(0, 8)}...
              </span>
            </>
          ) : (
            <span style={{ 
              color: '#dc3545', 
              fontSize: '12px' 
            }}>
              ✗ 미연동
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'createdBy',
      label: '작성자',
      width: '10%',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {item.createdBy?.name || '-'}
        </span>
      ),
    },
    {
      key: 'action',
      label: '액션',
      width: '13%',
      align: 'right',
      render: (item) => (
        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
          <Button
            variant="secondary"
            onClick={() => handleEditClick(item)}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            수정
          </Button>
          <Button
            variant="danger"
            onClick={() => handleDeleteClick(item)}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            삭제
          </Button>
        </div>
      ),
    },
  ];

  if (!isAdmin) {
    return (
      <div
        style={{
          padding: '24px',
          backgroundColor: colors.primaryBackground,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#000000', marginBottom: '16px' }}>
            권한이 없습니다
          </h1>
          <p style={{ color: colors.primaryText }}>
            용어 관리 기능은 관리자만 사용할 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '24px',
        backgroundColor: colors.primaryBackground,
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          maxWidth: '1600px',
          margin: '0 auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: '#000000',
            }}
          >
            용어집 관리
          </h1>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" onClick={handleBatchAddClick}>
              대량 추가
            </Button>
            <Button onClick={handleAddClick}>
              용어 추가
            </Button>
          </div>
        </div>

        {/* 검색 및 필터 바 */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <input
            type="text"
            placeholder="용어 검색 (원문, 번역, 설명)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              minWidth: '200px',
              padding: '8px 12px',
              border: `1px solid ${colors.border}`,
              borderRadius: '4px',
              fontSize: '14px',
              backgroundColor: colors.surface,
              color: '#000000',
            }}
          />

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontSize: '13px', color: colors.primaryText }}>원문 언어:</label>
            <select
              value={selectedSourceLang}
              onChange={(e) => setSelectedSourceLang(e.target.value)}
              style={{
                padding: '6px 12px',
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                fontSize: '13px',
                backgroundColor: colors.surface,
                color: '#000000',
                cursor: 'pointer',
              }}
            >
              <option value="">전체</option>
              {languageOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontSize: '13px', color: colors.primaryText }}>번역 언어:</label>
            <select
              value={selectedTargetLang}
              onChange={(e) => setSelectedTargetLang(e.target.value)}
              style={{
                padding: '6px 12px',
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                fontSize: '13px',
                backgroundColor: colors.surface,
                color: '#000000',
                cursor: 'pointer',
              }}
            >
              <option value="">전체</option>
              {languageOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 테이블 */}
        {loading ? (
          <div
            style={{
              padding: '48px',
              textAlign: 'center',
              color: colors.primaryText,
              fontSize: '13px',
            }}
          >
            로딩 중...
          </div>
        ) : (
          <>
            <Table
              columns={columns}
              data={filteredTerms}
              emptyMessage="용어가 없습니다."
            />
            
            {/* 페이지네이션 */}
            {totalPages > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '24px',
                  padding: '16px',
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '13px', color: colors.primaryText }}>
                    페이지 크기:
                  </span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(0); // 페이지 크기 변경 시 첫 페이지로
                    }}
                    style={{
                      padding: '6px 12px',
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      fontSize: '13px',
                      backgroundColor: colors.surface,
                      color: '#000000',
                      cursor: 'pointer',
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span style={{ fontSize: '13px', color: colors.primaryText, marginLeft: '8px' }}>
                    전체 {totalElements}개
                  </span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Button
                    variant="secondary"
                    onClick={() => setCurrentPage(0)}
                    disabled={currentPage === 0}
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    처음
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 0}
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    이전
                  </Button>
                  
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i;
                      } else if (currentPage < 3) {
                        pageNum = i;
                      } else if (currentPage > totalPages - 4) {
                        pageNum = totalPages - 5 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "primary" : "secondary"}
                          onClick={() => setCurrentPage(pageNum)}
                          style={{ 
                            fontSize: '12px', 
                            padding: '6px 12px',
                            minWidth: '36px'
                          }}
                        >
                          {pageNum + 1}
                        </Button>
                      );
                    })}
                  </div>
                  
                  <Button
                    variant="secondary"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage >= totalPages - 1}
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    다음
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setCurrentPage(totalPages - 1)}
                    disabled={currentPage >= totalPages - 1}
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    마지막
                  </Button>
                  
                  <span style={{ fontSize: '13px', color: colors.primaryText, marginLeft: '12px' }}>
                    {currentPage + 1} / {totalPages}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* 대량 추가 모달 */}
        <Modal
          isOpen={isBatchAddModalOpen}
          onClose={() => setIsBatchAddModalOpen(false)}
          title="용어 대량 추가"
          onConfirm={handleBatchAddConfirm}
          confirmText="추가"
          cancelText="취소"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: colors.primaryText }}>
                  원문 언어 *
                </label>
                <select
                  value={batchFormData.sourceLang}
                  onChange={(e) => setBatchFormData({ ...batchFormData, sourceLang: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                  required
                >
                  {languageOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: colors.primaryText }}>
                  번역 언어 *
                </label>
                <select
                  value={batchFormData.targetLang}
                  onChange={(e) => setBatchFormData({ ...batchFormData, targetLang: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                  required
                >
                  {languageOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: colors.primaryText }}>
                용어 목록 * (TSV 형식: 구분\t영어\t한국어\t기사제목\t출처\t기사링크\t메모)
              </label>
              <textarea
                value={batchFormData.termsText}
                onChange={(e) => setBatchFormData({ ...batchFormData, termsText: e.target.value })}
                placeholder="구분(분야)	영어	한국어	기사제목	출처(날짜)	기사링크	메모&#10;과학	Anti-science of creationists	사이비 과학을 하는 창조과학자 (낙인)	만연해있는 과학 사기가 계속 증가하고 있다.	CEH, 2024. 2. 14	https://creation.kr/Science/...	"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                  minHeight: '200px',
                  resize: 'vertical',
                  fontFamily: 'monospace',
                }}
                required
              />
              <div style={{ marginTop: '8px', fontSize: '12px', color: colors.primaryText }}>
                <p style={{ margin: '4px 0' }}>
                  <strong>입력 형식:</strong> 각 줄에 하나의 용어를 입력하세요. 첫 줄은 헤더로 자동 스킵됩니다.
                </p>
                <p style={{ margin: '4px 0' }}>
                  <strong>형식:</strong> 구분(탭)영어(탭)한국어(탭)기사제목(탭)출처(탭)기사링크(탭)메모
                </p>
                <p style={{ margin: '4px 0' }}>
                  <strong>필수:</strong> 영어, 한국어 (나머지는 선택사항)
                </p>
                <p style={{ margin: '4px 0' }}>
                  <strong>예시:</strong>
                </p>
                <pre style={{ 
                  margin: '4px 0', 
                  padding: '8px', 
                  backgroundColor: colors.surface, 
                  borderRadius: '4px',
                  fontSize: '11px',
                  overflow: 'auto'
                }}>
{`구분(분야)	영어	한국어	기사제목	출처(날짜)	기사링크	메모
과학	Anti-science of creationists	사이비 과학을 하는 창조과학자 (낙인)	만연해있는 과학 사기가 계속 증가하고 있다.	CEH, 2024. 2. 14	https://creation.kr/Science/...	
과학	Baconian method	베이컨식 방법	모델은 사실이 아니다.	CEH, 2024. 7. 24	https://creation.kr/Science/...	`}
                </pre>
                <p style={{ margin: '4px 0', fontSize: '11px' }}>
                  * 영어와 한국어는 필수입니다. 나머지 필드는 선택사항입니다. 빈 줄은 무시됩니다.
                </p>
                <p style={{ margin: '4px 0', fontSize: '11px', color: '#0984e3' }}>
                  * DeepL에는 영어와 한국어만 전송되며, 나머지 정보는 DB에만 저장됩니다.
                </p>
              </div>
            </div>
          </div>
        </Modal>

        {/* 용어 추가 모달 */}
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title="용어 추가"
          onConfirm={handleAddConfirm}
          confirmText="추가"
          cancelText="취소"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: colors.primaryText }}>
                원문 용어 *
              </label>
              <input
                type="text"
                value={formData.sourceTerm}
                onChange={(e) => setFormData({ ...formData, sourceTerm: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: colors.primaryText }}>
                번역 용어 *
              </label>
              <input
                type="text"
                value={formData.targetTerm}
                onChange={(e) => setFormData({ ...formData, targetTerm: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: colors.primaryText }}>
                  원문 언어 *
                </label>
                <select
                  value={formData.sourceLang}
                  onChange={(e) => setFormData({ ...formData, sourceLang: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                  required
                >
                  {languageOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: colors.primaryText }}>
                  번역 언어 *
                </label>
                <select
                  value={formData.targetLang}
                  onChange={(e) => setFormData({ ...formData, targetLang: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                  required
                >
                  {languageOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: colors.primaryText }}>
                설명
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                  minHeight: '80px',
                  resize: 'vertical',
                }}
              />
            </div>
          </div>
        </Modal>

        {/* 용어 수정 모달 */}
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedTerm(null);
          }}
          title="용어 수정"
          onConfirm={handleEditConfirm}
          confirmText="수정"
          cancelText="취소"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: colors.primaryText }}>
                원문 용어 *
              </label>
              <input
                type="text"
                value={formData.sourceTerm}
                onChange={(e) => setFormData({ ...formData, sourceTerm: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: colors.primaryText }}>
                번역 용어 *
              </label>
              <input
                type="text"
                value={formData.targetTerm}
                onChange={(e) => setFormData({ ...formData, targetTerm: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: colors.primaryText }}>
                  원문 언어 *
                </label>
                <select
                  value={formData.sourceLang}
                  onChange={(e) => setFormData({ ...formData, sourceLang: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                  required
                >
                  {languageOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: colors.primaryText }}>
                  번역 언어 *
                </label>
                <select
                  value={formData.targetLang}
                  onChange={(e) => setFormData({ ...formData, targetLang: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                  required
                >
                  {languageOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: colors.primaryText }}>
                설명
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                  minHeight: '80px',
                  resize: 'vertical',
                }}
              />
            </div>
          </div>
        </Modal>

        {/* 용어 삭제 모달 */}
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setSelectedTerm(null);
          }}
          title="용어 삭제 확인"
          onConfirm={handleDeleteConfirm}
          confirmText="삭제"
          cancelText="취소"
          variant="danger"
        >
          <p>
            정말로 "{selectedTerm?.sourceTerm}" → "{selectedTerm?.targetTerm}" 용어를 삭제하시겠습니까?
            <br />
            이 작업은 되돌릴 수 없습니다.
          </p>
        </Modal>
      </div>
    </div>
  );
}

