export default function FriendRequestModal({
  visible,
  onClose,
  requests = [],
  onHandle,
  groupApplications = [],
  onHandleGroupApplication
}) {
  if (!visible) return null;

  return (
    <div className="modal-mask">
      <div className="modal-card">
        <div className="modal-header">
          <span>申请中心</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div style={{ fontWeight: 700, marginBottom: '12px' }}>好友申请</div>

          <div className="modal-result-list">
            {requests.length === 0 ? (
              <div className="modal-empty">暂无新的好友申请</div>
            ) : (
              requests.map((item) => (
                <div className="modal-user-item" key={item.id}>
                  <div className="modal-user-info">
                    <div className="modal-user-avatar">
                      {(item.requester?.nickname || item.requester?.username || 'U').slice(0, 1)}
                    </div>
                    <div>
                      <div className="modal-user-name">
                        {item.requester?.nickname || item.requester?.username}
                      </div>
                      <div className="modal-user-subname">
                        用户名：{item.requester?.username}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="modal-btn"
                      onClick={() => onHandle(item.id, 'accept')}
                    >
                      同意
                    </button>
                    <button
                      className="modal-btn reject"
                      onClick={() => onHandle(item.id, 'reject')}
                    >
                      拒绝
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ marginTop: '18px', fontWeight: 700, marginBottom: '12px' }}>
            群聊邀请 / 入群申请
          </div>

          <div className="modal-result-list">
            {groupApplications.length === 0 ? (
              <div className="modal-empty">暂无新的群聊申请</div>
            ) : (
              groupApplications.map((item) => (
                <div className="modal-user-item" key={item.id}>
                  <div className="modal-user-info">
                    <div className="modal-user-avatar">
                      {(item.group?.name || '群').slice(0, 1)}
                    </div>
                    <div>
                      <div className="modal-user-name">
                        {item.type === 'invite'
                          ? `${item.sender?.nickname || item.sender?.username} 邀请你加入 ${item.group?.name}`
                          : `${item.sender?.nickname || item.sender?.username} 申请加入 ${item.group?.name}`}
                      </div>
                      <div className="modal-user-subname">
                        {item.group?.description || '暂无群介绍'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="modal-btn"
                      onClick={() => onHandleGroupApplication(item.id, 'accept')}
                    >
                      同意
                    </button>
                    <button
                      className="modal-btn reject"
                      onClick={() => onHandleGroupApplication(item.id, 'reject')}
                    >
                      拒绝
                    </button>
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