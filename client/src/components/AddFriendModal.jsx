import { useState } from 'react';

export default function AddFriendModal({
  visible,
  onClose,
  onSearch,
  onAddFriend,
  searchResults,
  loading
}) {
  const [keyword, setKeyword] = useState('');

  if (!visible) return null;

  const handleSearch = async () => {
    await onSearch(keyword);
  };

  const renderActionBtn = (item) => {
    if (item.relationStatus === 'accepted') {
      return (
        <button className="modal-btn disabled" disabled>
          已是好友
        </button>
      );
    }

    if (item.relationStatus === 'pending') {
      return (
        <button className="modal-btn disabled" disabled>
          已发送申请
        </button>
      );
    }

    return (
      <button className="modal-btn" onClick={() => onAddFriend(item)}>
        添加
      </button>
    );
  };

  return (
    <div className="modal-mask">
      <div className="modal-card">
        <div className="modal-header">
          <span>添加好友</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-search">
            <input
              type="text"
              placeholder="输入用户名或昵称搜索"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <button onClick={handleSearch} disabled={loading}>
              {loading ? '搜索中...' : '搜索'}
            </button>
          </div>

          <div className="modal-result-list">
            {searchResults.length === 0 ? (
              <div className="modal-empty">暂无搜索结果</div>
            ) : (
              searchResults.map((item) => (
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

                  <div>{renderActionBtn(item)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}