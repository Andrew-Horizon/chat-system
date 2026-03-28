import React from 'react';

export default function ReadReceiptModal({ visible, onClose, users = [] }) {
  if (!visible) return null;

  return (
    <div className="modal-mask modal-mask-top">
      <div className="modal-card small">
        <div className="modal-header">
          <span>已读人员 ({users.length})</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-result-list">
            {users.length === 0 ? (
              <div className="modal-empty">暂无已读人员</div>
            ) : (
              users.map((user) => (
                <div className="modal-user-item" key={user._id || user.id || user}>
                  <div className="modal-user-info">
                    <div className="modal-user-avatar">
                      {(user.nickname || user.username || 'U').slice(0, 1)}
                    </div>
                    <div>
                      <div className="modal-user-name">
                        {user.nickname || user.username || '未知'}{' '}
                        {user.username && (
                          <span className="modal-user-subname" style={{ marginLeft: 8 }}>
                            (账号: {user.username})
                          </span>
                        )}
                      </div>
                    </div>
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
