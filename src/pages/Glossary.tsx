import React, { useState, useEffect, useMemo } from 'react';
import { Table, TableColumn } from '../components/Table';
import { colors } from '../constants/designTokens';
import { termApi, TermDictionaryResponse } from '../services/termApi';
import { Button } from '../components/Button';

const languageOptions = [
  { value: '', label: '전체' },
  { value: 'EN', label: '영어' },
  { value: 'KO', label: '한국어' },
  { value: 'JA', label: '일본어' },
  { value: 'ZH', label: '중국어' },
  { value: 'ES', label: '스페인어' },
  { value: 'FR', label: '프랑스어' },
  { value: 'DE', label: '독일어' },
];

export default function Glossary() {
  const [terms, setTerms] = useState<TermDictionaryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSourceLang, setSelectedSourceLang] = useState<string>('');
  const [selectedTargetLang, setSelectedTargetLang] = useState<string>('');

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        setLoading(true);
        const params: { sourceLang?: string; targetLang?: string } = {};
        if (selectedSourceLang) params.sourceLang = selectedSourceLang;
        if (selectedTargetLang) params.targetLang = selectedTargetLang;
        const response = await termApi.getAllTerms(params);
        setTerms(response);
      } catch (error) {
        console.error('용어 목록 조회 실패:', error);
        setTerms([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTerms();
  }, [selectedSourceLang, selectedTargetLang]);

  const filteredTerms = useMemo(() => {
    if (!searchTerm.trim()) return terms;
    const term = searchTerm.toLowerCase();
    return terms.filter(
      (t) =>
        t.sourceTerm.toLowerCase().includes(term) ||
        t.targetTerm.toLowerCase().includes(term) ||
        (t.description && t.description.toLowerCase().includes(term))
    );
  }, [terms, searchTerm]);

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
      width: '15%',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {item.sourceLang} → {item.targetLang}
        </span>
      ),
    },
    {
      key: 'description',
      label: '설명',
      width: '30%',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {item.description || '-'}
        </span>
      ),
    },
    {
      key: 'createdBy',
      label: '작성자',
      width: '15%',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {item.createdBy?.name || '-'}
        </span>
      ),
    },
  ];

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
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: '#000000',
            marginBottom: '24px',
          }}
        >
          용어집
        </h1>

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
          <Table
            columns={columns}
            data={filteredTerms}
            emptyMessage="용어가 없습니다."
          />
        )}
      </div>
    </div>
  );
}

