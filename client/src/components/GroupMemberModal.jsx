export default function GroupMemberModal({
  visible,
  onClose,
  members = [],
  currentUserId,
  currentUserRole,
  onKickMember,
  onInviteMember
}) {
  if (!visible) return null;

  const formatStatus = (status) => {
    if (status === 'online') return '在线';
    if (status === 'offline') return '离线';
    return status || '未知状态';
  };

  const formatRole = (role) => {
    if (role === 'owner') return '群主';
    if (role === 'admin') return '管理员';
    return '成员';
  };

  const canKick = (member) => {
    if (currentUserRole !== 'owner') return false;
    if (!member) return false;
    if (String(member.id) === String(currentUserId)) return false;
    if (member.role === 'owner') return false;
    return true;
  };

  return (
    <div className="modal-mask">
      <div className="modal-card">
        <div className="modal-header">
          <span>群成员管理</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {currentUserRole === 'owner' ? (
              <button className="modal-btn" onClick={onInviteMember}>
                邀请成员
              </button>
            ) : null}
            <button className="modal-close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>

        <div className="modal-body">
          <div className="modal-result-list">
            {members.length === 0 ? (
              <div className="modal-empty">暂无群成员</div>
            ) : (
              members.map((member) => (
                <div className="modal-user-item" key={member.id}>
                  <div className="modal-user-info">
                    <div className="modal-user-avatar">
                      {(member.nickname || member.username || 'U').slice(0, 1)}
                    </div>
                    <div>
                      <div className="modal-user-name">
                        {member.nickname || member.username}
                      </div>
                      <div className="modal-user-subname">
                        用户名：{member.username} ｜ {formatStatus(member.status)} ｜ {formatRole(member.role)}
                      </div>
                    </div>
                  </div>

                  <div>
                    {canKick(member) ? (
                      <button
                        className="modal-btn reject"
                        onClick={() => onKickMember(member)}
                      >
                        踢出
                      </button>
                    ) : (
                      <button className="modal-btn disabled" disabled>
                        {member.role === 'owner'
                          ? '群主'
                          : String(member.id) === String(currentUserId)
                          ? '自己'
                          : '不可操作'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}