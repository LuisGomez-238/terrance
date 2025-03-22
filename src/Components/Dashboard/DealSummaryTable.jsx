import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

function DealSummaryTable({ deals }) {
  const navigate = useNavigate();
  
  function handleRowClick(dealId) {
    navigate(`/deals/${dealId}`);
  }
  
  return (
    <div className="deal-table-container">
      <table className="deal-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Vehicle</th>
            <th>Date</th>
            <th>Profit</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((deal) => (
            <tr 
              key={deal.id}
              onClick={() => handleRowClick(deal.id)}
              className="table-row-clickable"
            >
              <td>{deal.customerName}</td>
              <td>{deal.vehicle}</td>
              <td>{format(new Date(deal.date), 'MMM d, yyyy')}</td>
              <td className="profit">${deal.profit.toLocaleString()}</td>
              <td>
                <span className={`status-badge status-${deal.status.toLowerCase()}`}>
                  {deal.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DealSummaryTable;