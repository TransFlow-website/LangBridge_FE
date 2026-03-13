import React, { useState, useEffect } from 'react';
import { colors } from '../constants/designTokens';
import { Button } from '../components/Button';
import { Table, TableColumn } from '../components/Table';
import { Modal } from '../components/Modal';
import { settingsApi } from '../services/settingsApi';
import { categoryApi, CategoryResponse, CreateCategoryRequest } from '../services/categoryApi';
import { adminApi, UserListItem } from '../services/adminApi';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { roleLevelToRole } from '../utils/hasAccess';
import { UserRole } from '../types/user';

const roleLevelMap: Record<number, string> = {
  1: '최고 관리자',
  2: '중간 관리자',
  3: '번역봉사자',
};

export default function SystemSettings() {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<'users' | 'deepl' | 'category'>('users');

  // DeepL API 키 관련 상태
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 카테고리 관련 상태
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [addCategoryLoading, setAddCategoryLoading] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null);

  // 유저 관리 관련 상태
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null);
  const [newRoleLevel, setNewRoleLevel] = useState<number>(3);

  // 권한 체크
  const userRole = user ? roleLevelToRole(user.roleLevel) : null;
  const isAdmin = userRole === UserRole.SUPER_ADMIN || userRole === UserRole.ADMIN;
  const isSuperAdmin = userRole === UserRole.SUPER_ADMIN;

  // DeepL API 키 조회
  useEffect(() => {
    if (activeTab === 'deepl') {
      fetchApiKeyStatus();
    }
  }, [activeTab]);

  // 유저 목록 조회
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setUsersLoading(true);
        const response = await adminApi.getAllUsers();
        setUsers(response);
      } catch (error) {
        console.error('사용자 목록 조회 실패:', error);
        setUsers([]);
      } finally {
        setUsersLoading(false);
      }
    };

    if (activeTab === 'users' && isSuperAdmin) {
      fetchUsers();
    }
  }, [activeTab, isSuperAdmin]);

  // 카테고리 목록 조회
  useEffect(() => {
    if (activeTab === 'category') {
      fetchCategories();
    }
  }, [activeTab]);

  const fetchApiKeyStatus = async () => {
    try {
      const response = await settingsApi.getDeepLApiKey();
      setHasExistingKey(response.hasApiKey);
      if (response.updatedAt) {
        setLastUpdated(new Date(response.updatedAt).toLocaleString('ko-KR'));
      }
    } catch (error) {
      console.error('API 키 상태 조회 실패:', error);
    }
  };

  const handleOpenRoleModal = (user: UserListItem, targetRoleLevel: number) => {
    setSelectedUser(user);
    setNewRoleLevel(targetRoleLevel);
    setIsRoleModalOpen(true);
  };

  const handleConfirmRoleChange = async () => {
    if (!selectedUser) return;

    try {
      await adminApi.updateUserRoleLevel(selectedUser.id, newRoleLevel);
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, roleLevel: newRoleLevel } : u)),
      );
      setIsRoleModalOpen(false);
      setSelectedUser(null);
      alert('사용자 역할이 변경되었습니다.');
    } catch (error) {
      console.error('역할 변경 실패:', error);
      alert('역할 변경에 실패했습니다.');
    }
  };

  const userStats = {
    total: users.length,
    superAdmin: users.filter((u) => u.roleLevel === 1).length,
    admin: users.filter((u) => u.roleLevel === 2).length,
    volunteer: users.filter((u) => u.roleLevel === 3).length,
  };

  const userColumns: TableColumn<UserListItem>[] = [
    {
      key: 'name',
      label: '이름',
      width: '20%',
      render: (item) => <span style={{ fontWeight: 500, color: '#000000' }}>{item.name}</span>,
    },
    {
      key: 'email',
      label: '이메일',
      width: '25%',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>{item.email}</span>
      ),
    },
    {
      key: 'roleLevel',
      label: '역할',
      width: '15%',
      render: (item) => (
        <span style={{ color: colors.primaryText, fontSize: '12px' }}>
          {roleLevelMap[item.roleLevel] || `레벨 ${item.roleLevel}`}
        </span>
      ),
    },
    {
      key: 'createdAt',
      label: '가입일',
      width: '20%',
      render: (item) =>
        item.createdAt ? (
          <span style={{ color: colors.secondaryText, fontSize: '12px' }}>
            {new Date(item.createdAt).toLocaleDateString('ko-KR')}
          </span>
        ) : (
          <span style={{ color: colors.secondaryText, fontSize: '12px' }}>-</span>
        ),
    },
    {
      key: 'action',
      label: '중간관리자 설정',
      width: '20%',
      align: 'right',
      render: (item) => {
        if (item.roleLevel === 1) {
          return (
            <span style={{ fontSize: '12px', color: colors.secondaryText }}>
              최고 관리자는 변경할 수 없습니다
            </span>
          );
        }

        if (item.roleLevel === 2) {
          return (
            <Button
              variant="secondary"
              onClick={() => handleOpenRoleModal(item, 3)}
              style={{ fontSize: '12px', padding: '6px 12px' }}
            >
              중간관리자 해제
            </Button>
          );
        }

        return (
          <Button
            variant="secondary"
            onClick={() => handleOpenRoleModal(item, 2)}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            중간관리자로 임명
          </Button>
        );
      },
    },
  ];

  const fetchCategories = async () => {
    try {
      setCategoriesLoading(true);
      const response = await categoryApi.getAllCategories();
      setCategories(response);
    } catch (error) {
      console.error('카테고리 목록 조회 실패:', error);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      setSaveMessage({ type: 'error', text: 'API 키를 입력해주세요.' });
      return;
    }

    try {
      setSaveLoading(true);
      setSaveMessage(null);
      await settingsApi.saveDeepLApiKey({ apiKey: apiKey.trim() });
      setSaveMessage({ type: 'success', text: 'API 키가 성공적으로 저장되었습니다.' });
      setApiKey('');
      setShowApiKey(false);
      await fetchApiKeyStatus();
    } catch (error: any) {
      console.error('API 키 저장 실패:', error);
      setSaveMessage({
        type: 'error',
        text: error.response?.data?.message || 'API 키 저장에 실패했습니다.',
      });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      alert('카테고리 이름을 입력해주세요.');
      return;
    }

    try {
      setAddCategoryLoading(true);
      const request: CreateCategoryRequest = {
        name: newCategoryName.trim(),
        description: newCategoryDescription.trim() || undefined,
      };
      await categoryApi.createCategory(request);
      setNewCategoryName('');
      setNewCategoryDescription('');
      await fetchCategories();
    } catch (error: any) {
      console.error('카테고리 추가 실패:', error);
      alert(error.response?.data?.message || '카테고리 추가에 실패했습니다.');
    } finally {
      setAddCategoryLoading(false);
    }
  };

  const handleDeleteCategory = async (categoryId: number, categoryName: string) => {
    if (!window.confirm(`"${categoryName}" 카테고리를 삭제하시겠습니까?`)) {
      return;
    }

    try {
      setDeletingCategoryId(categoryId);
      await categoryApi.deleteCategory(categoryId);
      await fetchCategories();
    } catch (error: any) {
      console.error('카테고리 삭제 실패:', error);
      alert(error.response?.data?.message || '카테고리 삭제에 실패했습니다.');
    } finally {
      setDeletingCategoryId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: '24px' }}>
        <div
          style={{
            backgroundColor: colors.surface,
            borderRadius: '8px',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>접근 권한 없음</h2>
          <p style={{ fontSize: '14px', color: colors.secondaryText }}>
            시스템 설정은 관리자만 접근할 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* 페이지 헤더 */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: colors.primaryText, marginBottom: '8px' }}>
          시스템 설정
        </h1>
        <p style={{ fontSize: '14px', color: colors.secondaryText }}>
          시스템의 전반적인 설정을 관리합니다.
        </p>
      </div>

      {/* 탭 네비게이션 */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: `1px solid ${colors.border}`,
          marginBottom: '24px',
        }}
      >
        {isSuperAdmin && (
          <button
            onClick={() => setActiveTab('users')}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 500,
              color: activeTab === 'users' ? colors.accent : colors.secondaryText,
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom:
                activeTab === 'users' ? `2px solid ${colors.accent}` : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            유저 관리
          </button>
        )}
        <button
          onClick={() => setActiveTab('deepl')}
          style={{
            padding: '12px 24px',
            fontSize: '14px',
            fontWeight: 500,
            color: activeTab === 'deepl' ? colors.accent : colors.secondaryText,
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'deepl' ? `2px solid ${colors.accent}` : '2px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          DeepL API 키
        </button>
        <button
          onClick={() => setActiveTab('category')}
          style={{
            padding: '12px 24px',
            fontSize: '14px',
            fontWeight: 500,
            color: activeTab === 'category' ? colors.accent : colors.secondaryText,
            backgroundColor: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'category' ? `2px solid ${colors.accent}` : '2px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          카테고리 관리
        </button>
      </div>

      {/* 유저 관리 (최고관리자 전용) */}
      {activeTab === 'users' && isSuperAdmin && (
        <div>
          {/* 통계 카드 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <div style={{ fontSize: '12px', color: colors.secondaryText, marginBottom: '4px' }}>
                전체 사용자
              </div>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#000000' }}>
                {userStats.total}
              </div>
            </div>
            <div
              style={{
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <div style={{ fontSize: '12px', color: colors.secondaryText, marginBottom: '4px' }}>
                최고 관리자
              </div>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#000000' }}>
                {userStats.superAdmin}
              </div>
            </div>
            <div
              style={{
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <div style={{ fontSize: '12px', color: colors.secondaryText, marginBottom: '4px' }}>
                중간 관리자
              </div>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#000000' }}>
                {userStats.admin}
              </div>
            </div>
            <div
              style={{
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <div style={{ fontSize: '12px', color: colors.secondaryText, marginBottom: '4px' }}>
                번역봉사자
              </div>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#000000' }}>
                {userStats.volunteer}
              </div>
            </div>
          </div>

          {/* 유저 테이블 */}
          {usersLoading ? (
            <div
              style={{
                padding: '48px',
                textAlign: 'center',
                color: colors.primaryText,
                fontSize: '13px',
                backgroundColor: colors.surface,
                borderRadius: '8px',
                border: `1px solid ${colors.border}`,
              }}
            >
              로딩 중...
            </div>
          ) : users.length === 0 ? (
            <div
              style={{
                padding: '48px',
                textAlign: 'center',
                color: colors.primaryText,
                fontSize: '13px',
                backgroundColor: colors.surface,
                borderRadius: '8px',
                border: `1px solid ${colors.border}`,
              }}
            >
              <p>사용자 목록이 없습니다.</p>
              <p style={{ marginTop: '8px', fontSize: '12px', color: colors.secondaryText }}>
                관리자 페이지에서 사용자 생성 후 다시 확인해주세요.
              </p>
            </div>
          ) : (
            <Table columns={userColumns} data={users} emptyMessage="사용자가 없습니다." />
          )}

          {/* 역할 변경 모달 */}
          <Modal
            isOpen={isRoleModalOpen}
            onClose={() => {
              setIsRoleModalOpen(false);
              setSelectedUser(null);
            }}
            title="중간관리자 설정 변경"
            onConfirm={handleConfirmRoleChange}
            confirmText="변경"
            cancelText="취소"
          >
            {selectedUser && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p>
                  <strong>{selectedUser.name}</strong> ({selectedUser.email})의 역할을{' '}
                  {newRoleLevel === 2 ? '중간관리자(관리자)' : '번역봉사자'}로 변경하시겠습니까?
                </p>
                <p style={{ fontSize: '12px', color: colors.secondaryText }}>
                  * 이 기능은 최고관리자만 사용할 수 있습니다.
                </p>
              </div>
            )}
          </Modal>
        </div>
      )}

      {/* DeepL API 키 설정 */}
      {activeTab === 'deepl' && (
        <div
          style={{
            backgroundColor: colors.surface,
            borderRadius: '8px',
            border: `1px solid ${colors.border}`,
            padding: '24px',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>DeepL API 키 설정</h2>
          <p style={{ fontSize: '13px', color: colors.secondaryText, marginBottom: '24px' }}>
            번역에 사용할 DeepL API 키를 입력하세요. 입력된 키는 암호화되어 안전하게 저장됩니다.
          </p>

          {/* 현재 상태 */}
          {hasExistingKey && (
            <div
              style={{
                backgroundColor: '#f0f9ff',
                border: '1px solid #0284c7',
                borderRadius: '6px',
                padding: '12px 16px',
                marginBottom: '24px',
                fontSize: '13px',
                color: '#0c4a6e',
              }}
            >
              ✓ API 키가 등록되어 있습니다.
              {lastUpdated && <span style={{ marginLeft: '8px' }}>최종 업데이트: {lastUpdated}</span>}
            </div>
          )}

          {/* API 키 입력 폼 */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: '8px',
                color: colors.primaryText,
              }}
            >
              API 키 {hasExistingKey ? '(새로운 키로 업데이트)' : ''}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="DeepL API 키를 입력하세요"
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 12px',
                  fontSize: '14px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveApiKey();
                  }
                }}
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: colors.secondaryText,
                }}
                title={showApiKey ? 'API 키 숨기기' : 'API 키 보기'}
              >
                {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* 저장 버튼 */}
          <Button
            variant="primary"
            onClick={handleSaveApiKey}
            disabled={saveLoading || !apiKey.trim()}
            style={{ fontSize: '14px', padding: '10px 20px' }}
          >
            {saveLoading ? '저장 중...' : hasExistingKey ? 'API 키 업데이트' : 'API 키 저장'}
          </Button>

          {/* 저장 결과 메시지 */}
          {saveMessage && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                backgroundColor: saveMessage.type === 'success' ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${saveMessage.type === 'success' ? '#22c55e' : '#ef4444'}`,
                color: saveMessage.type === 'success' ? '#15803d' : '#b91c1c',
              }}
            >
              {saveMessage.text}
            </div>
          )}

          {/* 안내 사항 */}
          <div
            style={{
              marginTop: '24px',
              padding: '16px',
              backgroundColor: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#92400e',
            }}
          >
            <p style={{ fontWeight: 600, marginBottom: '8px' }}>⚠️ 보안 안내</p>
            <ul style={{ paddingLeft: '20px', margin: 0 }}>
              <li>API 키는 AES 암호화되어 데이터베이스에 저장됩니다.</li>
              <li>저장된 API 키는 번역 서비스에서만 사용됩니다.</li>
              <li>API 키가 유출되지 않도록 주의해주세요.</li>
            </ul>
          </div>
        </div>
      )}

      {/* 카테고리 관리 */}
      {activeTab === 'category' && (
        <div>
          {/* 카테고리 추가 폼 */}
          <div
            style={{
              backgroundColor: colors.surface,
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
              padding: '24px',
              marginBottom: '24px',
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>새 카테고리 추가</h2>
            <p style={{ fontSize: '13px', color: colors.secondaryText, marginBottom: '24px' }}>
              문서를 분류할 카테고리를 추가합니다.
            </p>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1', minWidth: '200px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '8px',
                    color: colors.primaryText,
                  }}
                >
                  카테고리 이름 *
                </label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="예: 웹사이트, 마케팅, 기술문서"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '14px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddCategory();
                    }
                  }}
                />
              </div>

              <div style={{ flex: '2', minWidth: '300px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '8px',
                    color: colors.primaryText,
                  }}
                >
                  설명 (선택사항)
                </label>
                <input
                  type="text"
                  value={newCategoryDescription}
                  onChange={(e) => setNewCategoryDescription(e.target.value)}
                  placeholder="카테고리에 대한 설명"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '14px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddCategory();
                    }
                  }}
                />
              </div>
            </div>

            <Button
              variant="primary"
              onClick={handleAddCategory}
              disabled={addCategoryLoading || !newCategoryName.trim()}
              style={{ fontSize: '14px', padding: '10px 20px' }}
            >
              <Plus size={16} style={{ marginRight: '6px' }} />
              {addCategoryLoading ? '추가 중...' : '카테고리 추가'}
            </Button>
          </div>

          {/* 카테고리 목록 */}
          <div
            style={{
              backgroundColor: colors.surface,
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
              padding: '24px',
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>카테고리 목록</h2>

            {categoriesLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: colors.secondaryText }}>
                로딩 중...
              </div>
            ) : categories.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px',
                  color: colors.secondaryText,
                  fontSize: '14px',
                }}
              >
                등록된 카테고리가 없습니다.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {categories.map((category) => (
                  <div
                    key={category.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px',
                      border: `1px solid ${colors.border}`,
                      borderRadius: '6px',
                      backgroundColor: '#ffffff',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>
                        {category.name}
                      </div>
                      {category.description && (
                        <div style={{ fontSize: '13px', color: colors.secondaryText }}>
                          {category.description}
                        </div>
                      )}
                      <div style={{ fontSize: '12px', color: colors.secondaryText, marginTop: '8px' }}>
                        생성일: {new Date(category.createdAt).toLocaleDateString('ko-KR')}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteCategory(category.id, category.name)}
                      disabled={deletingCategoryId === category.id}
                      style={{
                        padding: '8px 12px',
                        fontSize: '13px',
                        color: '#dc2626',
                        backgroundColor: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        cursor: deletingCategoryId === category.id ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        opacity: deletingCategoryId === category.id ? 0.5 : 1,
                      }}
                    >
                      <Trash2 size={14} />
                      {deletingCategoryId === category.id ? '삭제 중...' : '삭제'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

