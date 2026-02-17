import React, { useState, useEffect } from 'react';

interface TrainingMetrics {
  loss: number | null;
  accuracy: number | null;
  pairs_count: number;
  last_trained: string | null;
  version: string | null;
}

interface TrainingHistoryItem {
  trained_at: string;
  loss: number;
  accuracy: number;
  pairs_count: number;
  version: string;
}

const BatchTrainingMetrics: React.FC = () => {
  const [metrics, setMetrics] = useState<TrainingMetrics | null>(null);
  const [history, setHistory] = useState<TrainingHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    fetchMetrics();
    fetchHistory();
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/v1/admin/batch-training/metrics');
      const data = await response.json();
      setMetrics(data);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/v1/admin/batch-training/history?limit=30');
      const data = await response.json();
      setHistory(data);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerTraining = async () => {
    setTriggering(true);
    try {
      await fetch('/api/v1/admin/batch-training/run', { method: 'POST' });
      await fetchMetrics();
      await fetchHistory();
    } catch (error) {
      console.error('Failed to trigger training:', error);
    } finally {
      setTriggering(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const getVersion = (version: string | null) => {
    if (!version) return 'N/A';
    try {
      // Handle ISO format timestamps
      const date = new Date(version);
      if (!isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
      }
      return version.slice(0, 8);
    } catch {
      return version.slice(0, 8) || 'N/A';
    }
  };

  if (loading) {
    return (
      <div className="batch-training-metrics">
        <div className="loading-state">
          <p>Loading metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="batch-training-metrics">
      {/* Metrics Cards */}
      <div className="metrics-cards">
        <div className="metric-card">
          <h3>Training Loss</h3>
          <p className={`metric-value ${metrics?.loss && metrics.loss > 0.8 ? 'warning' : 'good'}`}>
            {metrics?.loss?.toFixed(4) || 'N/A'}
          </p>
          <span className="metric-label">Lower is better (&lt; 0.5)</span>
        </div>
        
        <div className="metric-card">
          <h3>Accuracy</h3>
          <p className={`metric-value ${metrics?.accuracy && metrics.accuracy < 0.5 ? 'warning' : 'good'}`}>
            {metrics?.accuracy ? `${(metrics.accuracy * 100).toFixed(1)}%` : 'N/A'}
          </p>
          <span className="metric-label">Higher is better (&gt; 70%)</span>
        </div>
        
        <div className="metric-card">
          <h3>Training Pairs</h3>
          <p className={`metric-value ${metrics && metrics.pairs_count < 10 ? 'warning' : 'good'}`}>
            {metrics?.pairs_count || 0}
          </p>
          <span className="metric-label">Min 10 required</span>
        </div>
        
        <div className="metric-card">
          <h3>Last Trained</h3>
          <p className="metric-value">
            {metrics?.last_trained ? formatDate(metrics.last_trained) : 'Never'}
          </p>
          <span className="metric-label">Version: {getVersion(metrics?.version)}</span>
        </div>
      </div>

      {/* History Table */}
      {history.length > 0 && (
        <div className="history-section">
          <h3>Training History (Last {history.length} Runs)</h3>
          <table className="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Loss</th>
                <th>Accuracy</th>
                <th>Pairs</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item, index) => (
                <tr key={index}>
                  <td>{formatDate(item.trained_at)}</td>
                  <td className={item.loss > 0.8 ? 'warning' : 'good'}>
                    {item.loss.toFixed(4)}
                  </td>
                  <td className={item.accuracy < 0.5 ? 'warning' : 'good'}>
                    {(item.accuracy * 100).toFixed(1)}%
                  </td>
                  <td>{item.pairs_count}</td>
                  <td>{getVersion(item.version)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      <div className="metrics-actions">
        <button 
          onClick={handleTriggerTraining} 
          className="btn-primary"
          disabled={triggering}
        >
          {triggering ? 'Training...' : 'Run Training Now'}
        </button>
        
        <a href="/admin/docs/batch-training" className="btn-secondary">
          View Documentation
        </a>
      </div>
    </div>
  );
};

export default BatchTrainingMetrics;
