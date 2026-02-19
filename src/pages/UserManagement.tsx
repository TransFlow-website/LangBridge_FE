import React, { useState, useEffect } from 'react';
import { Table, TableColumn } from '../components/Table';
import { colors } from '../constants/designTokens';
import { adminApi, UserListItem } from '../services/adminApi';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { useUser } from '../contexts/UserContext';
import { UserRole } from '../types/user';

const roleLevelMap: Record<number, string> = {
  1: '최고 관리자',
  2: '관리자',
  3: '번역봉사자',
};

export default function UserManagement() {
  const { user: currentUser } = useUser();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null);
  const [newRoleLevel, setNewRoleLevel] = useState<number>(3);

  const isAdmin = currentUser?.role === UserRole.SUPER_ADMIN || currentUser?.role === UserRole.ADMIN;

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        // TODO: 백엔드에 사용자 목록 조회 API 추가 필요
        const response = await adminApi.getAllUsers();
        setUsers(response);
      } catch (error) {
        console.error('사용자 목록 조회 실패:', error);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const handleRoleChangeClick = (user: UserListItem) => {
    setSelectedUser(user);
    setNewRoleLevel(user.roleLevel);
    setIsRoleModalOpen(true);
  };

  const handleRoleChangeConfirm = async () => {
    if (!selectedUser) return;
    try {
      await adminApi.updateUserRoleLevel(selectedUser.id, newRoleLevel);
      setUsers(prev =>
        prev.map(u => (u.id === selectedUser.id ? { ...u, roleLevel: newRoleLevel } : u))
      );
      setIsRoleModalOpen(false);
      setSelectedUser(null);
      alert('사용자 역할이 변경되었습니다.');
    } catch (error) {
      console.error('역할 변경 실패:', error);
      alert('역할 변경에 실패했습니다.');
    }
  };

  // 통계 계산
  const stats = {
    total: users.length,
    superAdmin: users.filter(u => u.roleLevel === 1).length,
    admin: users.filter(u => u.roleLevel === 2).length,
    volunteer: users.filter(u => u.roleLevel === 3).length,
  };

  const columns: TableColumn<UserListItem>[] = [
    {
      key: 'name',
      label: '이름',
      width: '20%',
      render: (item) => (
        <span style={{ fontWeight: 500, color: '#000000' }}>{item.name}</span>
      ),
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
      key: 'action',
      label: '액션',
      width: '15%',
      align: 'right',
      render: (item) => (
        <Button
          variant="secondary"
          onClick={() => handleRoleChangeClick(item)}
          style={{ fontSize: '12px', padding: '6px 12px' }}
        >
          역할 변경
        </Button>
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
            사용자 관리 기능은 관리자만 사용할 수 있습니다.
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
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: '#000000',
            marginBottom: '24px',
          }}
        >
          사용자 관리
        </h1>

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
              {stats.total}
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
              {stats.superAdmin}
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
              관리자
            </div>
            <div style={{ fontSize: '24px', fontWeight: 600, color: '#000000' }}>
              {stats.admin}
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
              {stats.volunteer}
            </div>
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
        ) : users.length === 0 ? (
          <div
            style={{
              padding: '48px',
              textAlign: 'center',
              color: colors.primaryText,
              fontSize: '13px',
            }}
          >
            <p>사용자 목록 조회 API가 아직 구현되지 않았습니다.</p>
            <p style={{ marginTop: '8px', fontSize: '12px', color: colors.secondaryText }}>
              백엔드에 사용자 목록 조회 API를 추가해주세요.
            </p>
          </div>
        ) : (
          <Table
            columns={columns}
            data={users}
            emptyMessage="사용자가 없습니다."
          />
        )}

        {/* 역할 변경 모달 */}
        <Modal
          isOpen={isRoleModalOpen}
          onClose={() => {
            setIsRoleModalOpen(false);
            setSelectedUser(null);
          }}
          title="사용자 역할 변경"
          onConfirm={handleRoleChangeConfirm}
          confirmText="변경"
          cancelText="취소"
        >
          {selectedUser && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p>
                <strong>{selectedUser.name}</strong> ({selectedUser.email})의 역할을 변경합니다.
              </p>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: colors.primaryText }}>
                  새로운 역할 *
                </label>
                <select
                  value={newRoleLevel}
                  onChange={(e) => setNewRoleLevel(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                >
                  <option value={1}>최고 관리자 (Level 1)</option>
                  <option value={2}>관리자 (Level 2)</option>
                  <option value={3}>번역봉사자 (Level 3)</option>
                </select>
              </div>
              <p style={{ fontSize: '12px', color: colors.secondaryText }}>
                * 관리자(Level 2)는 중간 관리자로 임명할 수 있습니다.
              </p>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}

