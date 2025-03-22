function StatCard({ title, value, icon, trend, trendValue }) {
    return (
      <div className="stat-card">
        <div className="stat-icon">
          <span className="material-icons">{icon}</span>
        </div>
        <div className="stat-content">
          <h3>{title}</h3>
          <div className="stat-value">{value}</div>
          {trend && (
            <div className={`stat-trend ${trend}`}>
              <span className="material-icons">
                {trend === 'up' ? 'trending_up' : 'trending_down'}
              </span>
              <span>{trendValue}</span>
            </div>
          )}
        </div>
      </div>
    );
  }
  
  export default StatCard;