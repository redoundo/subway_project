import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// Mock axios for development without a backend
const mockAxios = {
  get: (url) => {
    console.log(`Mock GET request to: ${url}`);
    const examId = url.split('/').pop();
    return Promise.resolve({
      data: {
        event_logs: [
          { id: 1, exam_id: examId, examinee: { examinee: { id: 'user1', name: 'Alice' } }, event_type: 'gaze_off_screen', timestamp: '2025-08-21T10:05:00Z', screenshot_url: 'https://via.placeholder.com/640x480.png?text=Event+1' },
          { id: 2, exam_id: examId, examinee: { examinee: { id: 'user2', name: 'Bob' } }, event_type: 'window_switch', timestamp: '2025-08-21T10:15:00Z', screenshot_url: 'https://via.placeholder.com/640x480.png?text=Event+2' },
          { id: 3, exam_id: examId, examinee: { examinee: { id: 'user1', name: 'Alice' } }, event_type: 'audio_noise', timestamp: '2025-08-21T10:25:00Z', screenshot_url: 'https://via.placeholder.com/640x480.png?text=Event+3' },
          { id: 4, exam_id: examId, examinee: { examinee: { id: 'user3', name: 'Charlie' } }, event_type: 'multiple_faces', timestamp: '2025-08-21T10:30:00Z', screenshot_url: 'https://via.placeholder.com/640x480.png?text=Event+4' },
          { id: 5, exam_id: examId, examinee: { examinee: { id: 'user2', name: 'Bob' } }, event_type: 'gaze_off_screen', timestamp: '2025-08-21T10:45:00Z', screenshot_url: 'https://via.placeholder.com/640x480.png?text=Event+5' },
        ],
        examinees: [
          { id: 'user1', name: 'Alice' },
          { id: 'user2', name: 'Bob' },
          { id: 'user3', name: 'Charlie' },
        ],
        exam_start_time: '2025-08-21T10:00:00Z',
        exam_end_time: '2025-08-21T11:00:00Z',
      }
    });
  }
};


const EVENT_TYPES = [
  'gaze_off_screen',
  'window_switch',
  'audio_noise',
  'multiple_faces',
  'prohibited_item_detected',
  'proctor_snapshot',
  'manual_flag',
];

const ReportDashboard = () => {
  const { examId } = useParams();
  const [eventLogs, setEventLogs] = useState([]);
  const [examinees, setExaminees] = useState([]);
  const [examTime, setExamTime] = useState({ start: null, end: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedUserId, setSelectedUserId] = useState('all');
  const [viewMode, setViewMode] = useState('chart'); // 'chart' or 'table'
  const [activeEventLogs, setActiveEventLogs] = useState([]);
  const [selectedEventLog, setSelectedEventLog] = useState(null);

  useEffect(() => {
    const fetchReportData = async () => {
      try {
        // In a real application, you would use the actual axios instance.
        // const response = await axios.get(`/api/reports/${examId}`);
        const response = await mockAxios.get(`/api/reports/${examId}`); // Using mock for now
        
        setEventLogs(response.data.event_logs || []);
        const examineeMap = new Map();
        (response.data.examinees || []).forEach(ex => examineeMap.set(ex.id, ex.name));
        setExaminees(Array.from(examineeMap.entries()).map(([id, name]) => ({ id, name })));
        setExamTime({ start: response.data.exam_start_time, end: response.data.exam_end_time });

      } catch (err) {
        setError('Failed to fetch report data.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
  }, [examId]);

  const filteredLogs = useMemo(() => {
    if (selectedUserId === 'all') {
      return eventLogs;
    }
    return eventLogs.filter(log => log.examinee.examinee.id === selectedUserId);
  }, [eventLogs, selectedUserId]);

  const handleChartClick = (elements) => {
    if (elements.length === 0) return;
    // This is a simplified click handler. A real implementation might need
    // more complex logic to determine the exact logs based on the clicked element.
    // For now, we'll just show all logs for the selected user.
    setActiveEventLogs(filteredLogs);
    setSelectedEventLog(null);
  };
  
  const handleTableClick = (logs) => {
    setActiveEventLogs(logs);
    setSelectedEventLog(null);
  };


  if (loading) return <div>Loading report...</div>;
  if (error) return <div>{error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>
      <h1>Exam Report: {examId}</h1>

      {/* Top Section */}
      <div style={{ flex: '0 0 40%', border: '1px solid #ccc', padding: '10px', display: 'flex', gap: '10px' }}>
        <div style={{flex: 1}}>
          <label htmlFor="examinee-select">Select Examinee: </label>
          <select
            id="examinee-select"
            value={selectedUserId}
            onChange={(e) => {
              setSelectedUserId(e.target.value);
              setActiveEventLogs([]);
              setSelectedEventLog(null);
            }}
          >
            <option value="all">All Examinees</option>
            {examinees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 3, border: '1px solid #eee', padding: '10px', display: 'flex', gap: '10px' }}>
            {activeEventLogs.length > 0 ? (
                <>
                    <div style={{ flex: 1, overflowY: 'auto', maxHeight: '300px' }}>
                        <strong>Event Logs:</strong>
                        {activeEventLogs.map(log => (
                            <button key={log.id} onClick={() => setSelectedEventLog(log)} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '5px' }}>
                                {log.examinee.examinee.name} - {new Date(log.timestamp).toLocaleTimeString()}
                            </button>
                        ))}
                    </div>
                    <div style={{ flex: 2, borderLeft: '1px solid #ccc', paddingLeft: '10px' }}>
                        {selectedEventLog ? (
                            <div>
                                <strong>Event Details:</strong>
                                <p><strong>Examinee:</strong> {selectedEventLog.examinee.examinee.name}</p>
                                <p><strong>Event Type:</strong> {selectedEventLog.event_type}</p>
                                <p><strong>Timestamp:</strong> {new Date(selectedEventLog.timestamp).toLocaleString()}</p>
                                <img src={selectedEventLog.screenshot_url} alt="Event Screenshot" style={{ maxWidth: '100%', height: 'auto' }} />
                            </div>
                        ) : (
                            <p>Select an event to see details.</p>
                        )}
                    </div>
                </>
            ) : (
                <p>Click on a chart bar or table cell to view corresponding event logs.</p>
            )}
        </div>
      </div>

      {/* Bottom Section */}
      <div style={{ flex: '0 0 60%', padding: '10px' }}>
        <div>
          <button onClick={() => setViewMode('chart')} disabled={viewMode === 'chart'}>Chart View</button>
          <button onClick={() => setViewMode('table')} disabled={viewMode === 'table'}>Table View</button>
        </div>
        <div style={{ marginTop: '10px' }}>
          {viewMode === 'chart' ? (
            <ReportChart eventLogs={filteredLogs} examTime={examTime} onChartClick={handleChartClick} />
          ) : (
            <ReportTable eventLogs={eventLogs} examinees={examinees} selectedUserId={selectedUserId} onCellClick={handleTableClick} />
          )}
        </div>
      </div>
    </div>
  );
};

const ReportChart = ({ eventLogs, examTime, onChartClick }) => {
    const timeLabels = useMemo(() => {
        if (!examTime.start || !examTime.end) return [];
        const start = new Date(examTime.start);
        const end = new Date(examTime.end);
        const durationMinutes = (end - start) / (1000 * 60);
        
        // Determine interval to have between 5 and 20 labels
        let interval = 10; // default 10 minutes
        if (durationMinutes / interval > 20) {
            interval = Math.ceil(durationMinutes / 20);
        } else if (durationMinutes / interval < 5 && durationMinutes > 0) {
            interval = Math.floor(durationMinutes / 5) || 1;
        }

        const labels = [];
        let current = new Date(start);
        while (current <= end) {
            labels.push(current.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            current.setMinutes(current.getMinutes() + interval);
        }
        return labels;
    }, [examTime]);

    const data = {
        labels: EVENT_TYPES,
        datasets: [{
            label: 'Cheating Events Count',
            data: EVENT_TYPES.map(type => eventLogs.filter(log => log.event_type === type).length),
            backgroundColor: 'rgba(75, 192, 192, 0.6)',
        }],
    };

    const options = {
        responsive: true,
        plugins: {
            legend: {
                position: 'top',
            },
            title: {
                display: true,
                text: 'Cheating Events by Type',
            },
        },
        onClick: (event, elements) => {
            onChartClick(elements);
        },
    };

    return <Bar options={options} data={data} />;
};

const ReportTable = ({ eventLogs, examinees, selectedUserId, onCellClick }) => {
    const displayExaminees = useMemo(() => {
        if (selectedUserId !== 'all') {
            return examinees.filter(e => e.id === selectedUserId);
        }
        return examinees;
    }, [examinees, selectedUserId]);

    const getLogsForCell = (examineeId, eventType) => {
        return eventLogs.filter(log => log.examinee.examinee.id === examineeId && log.event_type === eventType);
    };

    return (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
                <tr>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>Examinee</th>
                    {EVENT_TYPES.map(type => (
                        <th key={type} style={{ border: '1px solid #ddd', padding: '8px' }}>{type}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {displayExaminees.map(examinee => (
                    <tr key={examinee.id}>
                        <td style={{ border: '1px solid #ddd', padding: '8px' }}>{examinee.name}</td>
                        {EVENT_TYPES.map(type => {
                            const logs = getLogsForCell(examinee.id, type);
                            return (
                                <td 
                                    key={type} 
                                    style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center', cursor: logs.length > 0 ? 'pointer' : 'default' }}
                                    onClick={() => logs.length > 0 && onCellClick(logs)}
                                >
                                    {logs.length}
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

export default ReportDashboard;
