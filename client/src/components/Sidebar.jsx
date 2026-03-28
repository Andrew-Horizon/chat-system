export default function Sidebar({
  userInfo,
  activeMenu,
  setActiveMenu,
  onLogout
}) {
  return (
    <div className="sidebar">
      <div className="sidebar-user">
        <div className="sidebar-avatar">
          {userInfo?.nickname?.slice(0, 1) || 'U'}
        </div>
      </div>

      <div className="sidebar-menus">
        <button
          className={activeMenu === 'conversation' ? 'menu-btn active' : 'menu-btn'}
          onClick={() => setActiveMenu('conversation')}
        >
          聊天
        </button>

        <button
          className={activeMenu === 'friend' ? 'menu-btn active' : 'menu-btn'}
          onClick={() => setActiveMenu('friend')}
        >
          好友
        </button>

        <button
          className={activeMenu === 'group' ? 'menu-btn active' : 'menu-btn'}
          onClick={() => setActiveMenu('group')}
        >
          群组
        </button>
      </div>

      <div className="sidebar-bottom">
        <button className="menu-btn logout-btn" onClick={onLogout}>
          退出
        </button>
      </div>
    </div>
  );
}