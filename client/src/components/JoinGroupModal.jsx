import { useState } from 'react';

export default function JoinGroupModal({
  visible,
  onClose,
  onSearch,
  onJoin,
  searchResults,
  loading
}) {
  const [keyword, setKeyword] = useState('');

  if (!visible) return null;

  const handleSearch = async () => {
    await onSearch(keyword);
  };

  const renderBtn = (item) => {
    if (item.joinStatus === 'joined') {
      return <button className="modal-btn disabled" disabled>已加入</button>;
    }

    if (item.joinStatus === 'pending') {
      return <button className="modal-btn disabled" disabled>申请中</button>;
    }

    return (
      <button className="modal-btn" onClick={() => onJoin(item)}>
        申请加入
      </button>
    );
  };

  return (
    <div className="modal-mask">
      <div className="modal-card">
        <div className="modal-header">
          <span>加入群聊</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="modal-search">
            <input
              type="text"
              placeholder="输入群名搜索"
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
                <div key={item.id} className="modal-user-item">
                  <div className="modal-user-info">
                    <div className="modal-user-avatar">
                      {(item.name || '群').slice(0, 1)}
                    </div>
                    <div>
                      <div className="modal-user-name">{item.name}</div>
                      <div className="modal-user-subname">
                        {item.description || '暂无群介绍'}
                      </div>
                    </div>
                  </div>

                  <div>{renderBtn(item)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}