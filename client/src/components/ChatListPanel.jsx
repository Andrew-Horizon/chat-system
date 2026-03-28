export default function ChatListPanel({
  activeMenu,
  conversations,
  friends,
  groups,
  currentConversationId,
  onSelectConversation,
  onSelectFriend,
  onSelectGroup,
  onAddFriend,
  onOpenRequests,
  onDeleteFriend,
  onJoinGroup,
  onCreateGroup
}) {
  const renderTitle = () => {
    if (activeMenu === 'conversation') return '会话列表';
    if (activeMenu === 'friend') return '好友列表';
    return '群组列表';
  };

  const formatStatus = (status) => {
    if (status === 'online') return '在线';
    if (status === 'offline') return '离线';
    return status || '未知状态';
  };

  const renderAvatar = (user) => {
    if (user?.avatar) {
      return (
        <img
          src={user.avatar}
          alt={user.nickname || user.username || '头像'}
          className="list-avatar-img"
        />
      );
    }

    return (
      <div className="list-avatar-fallback">
        {(user?.nickname || user?.username || 'U').slice(0, 1)}
      </div>
    );
  };

  return (
    <div className="list-panel">
      <div className="list-panel-header">
        <span>{renderTitle()}</span>

        {activeMenu === 'friend' ? (
          <div className="panel-action-group">
            <button className="panel-action-btn secondary" onClick={onOpenRequests}>
              申请
            </button>
            <button className="panel-action-btn" onClick={onAddFriend}>
              添加
            </button>
          </div>
        ) : null}

        {activeMenu === 'group' ? (
          <div className="panel-action-group">
            <button className="panel-action-btn secondary" onClick={onJoinGroup}>
              加入
            </button>
            <button className="panel-action-btn" onClick={onCreateGroup}>
              创建
            </button>
          </div>
        ) : null}
      </div>

      <div className="list-panel-content">
        {activeMenu === 'conversation' &&
          conversations.map((item) => (
            <div
              key={item.id}
              className={currentConversationId === item.id ? 'list-item active' : 'list-item'}
              onClick={() => onSelectConversation(item)}
            >
              <div className="list-item-title">
                {item.type === 'private'
                  ? item.targetUser?.nickname || item.targetUser?.username || '单聊'
                  : item.groupInfo?.name || '群聊'}
              </div>
              <div className="list-item-desc">
                {item.lastMessage || '暂无消息'}
              </div>
            </div>
          ))}

        {activeMenu === 'friend' &&
          friends.map((item) => (
            <div key={item.id} className="list-item friend-item">
              <div className="friend-main" onClick={() => onSelectFriend(item)}>
                <div className="friend-left">
                  <div className="list-avatar">
                    {renderAvatar(item)}
                  </div>

                  <div className="friend-text">
                    <div className="list-item-title">{item.nickname || item.username}</div>
                    <div className="list-item-desc">{formatStatus(item.status)}</div>
                  </div>
                </div>
              </div>

              <button
                className="friend-delete-btn"
                onClick={() => onDeleteFriend(item)}
              >
                删除
              </button>
            </div>
          ))}

        {activeMenu === 'group' &&
          groups.map((item) => (
            <div
              key={item.id}
              className="list-item"
              onClick={() => onSelectGroup(item)}
            >
              <div className="list-item-title">{item.name}</div>
              <div className="list-item-desc">
                {item.description || '暂无群介绍'}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}