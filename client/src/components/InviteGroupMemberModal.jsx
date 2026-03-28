import { useState } from 'react';

export default function InviteGroupMemberModal({
  visible,
  onClose,
  candidates = [],
  onSubmit
}) {
  const [selectedIds, setSelectedIds] = useState([]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    await onSubmit(selectedIds);
    setSelectedIds([]);
  };

  const handleClose = () => {
    setSelectedIds([]);
    onClose();
  };

  const renderAction = (item) => {
    if (item.inviteStatus === 'joined') {
      return <button className="modal-btn disabled" disabled>已在群内</button>;
    }

    if (item.inviteStatus === 'pending') {
      return <button className="modal-btn disabled" disabled>已邀请</button>;
    }

    return (
      <input
        type="checkbox"
        checked={selectedIds.includes(item.id)}
        onChange={() => toggleSelect(item.id)}
      />
    );
  };

  if (!visible) return null;

  return (
    <div className="modal-mask">
      <div className="modal-card">
        <div className="modal-header">
          <span>邀请新成员</span>
          <button className="modal-close" onClick={handleClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-result-list">
            {candidates.length === 0 ? (
              <div className="modal-empty">暂无可邀请的好友</div>
            ) : (
              candidates.map((item) => (
                <div className="modal-user-item" key={item.id}>
                  <div className="modal-user-info">
                    <div className="modal-user-avatar">
                      {(item.nickname || item.username || 'U').slice(0, 1)}
                    </div>
                    <div>
                      <div className="modal-user-name">
                        {item.nickname || item.username}
                      </div>
                      <div className="modal-user-subname">
                        用户名：{item.username}
                      </div>
                    </div>
                  </div>

                  <div>{renderAction(item)}</div>
                </div>
              ))
            )}
          </div>

          <div className="modal-footer">
            <button className="modal-btn secondary" onClick={handleClose}>
              取消
            </button>
            <button className="modal-btn" onClick={handleSubmit}>
              发送邀请
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}