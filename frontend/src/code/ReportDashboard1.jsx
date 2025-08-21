/*
**!주의!** 지우지 마세요. 기록용입니다.
# 현재 파일에 있는 코드를 ai 에게 구현하도록 요청할 때 사용한 내용은 다음과 같습니다 :
## 시험 중 발생한 부정 행위에 대한 표와 차트를 작성해주는 리포트 대시보드를 구현해주세요.
### **리포트 대시보드 구성 :**
-  리포트 대시보드는 상단, 하단으로 나눠집니다.
-  상단에는 조회할 응시자를 고를 수 있는 드롭 다운과 표 혹은 차트의 특정 응시자, 시간을 클릭했을 때 그 조건에 맞는 EventLog 를 전부 모아서 보여주는 블록? 이 존재합니다.
-  하단은 차트와 표가 있지만, 차트, 표 각각 자리를 공간을 차지하는 게 아닌, `표`, `차트` 버튼을 누르면 해당 컴포넌트를 보여줍니다.
#### 하단 (아래에서 부터 60% 공간을 차지합니다)
1. **차트 :**
    - 차트 구현은 chart.js 라이브러리를 사용하시면 됩니다. 차트로는 Bar Chart를 사용해주세요.
    - 라벨과 값을 클릭하면 반드시 이벤트를 발생시켜야 합니다. options.interaction 이나 events 를 사용하여 구현해주세요.
    - **차트 구성 :**
        -  차트 데이터 셋 :
            -   차트에 표시할 데이터 셋 타입 : ['gaze_off_screen', 'window_switch', "audio_noise", "multiple_faces", 'prohibited_item_detected', 'proctor_snapshot', 'manual_flag']
            -   현재 조회 중인 exam_id 을 가진 모든 EventLog 데이터들을 대상으로 데이터 셋 타입 마다 `EventLog.event_type == 데이터 셋 타입` 인 EventLog 데이터들 모아 데이터 셋을 만듭니다.
            -   특정 응시자의 부정 행위 차트를 만들 때는 `str(EventLog.examinee.examinee.id) == userId` 라는 기준으로 EventLog 데이터를 거르신 뒤, `EventLog.event_type == 데이터 셋 타입`를 기준으로 데이터 셋을 만드시면 됩니다.
            -   차트의 세로축은 가로축의 시간 동안 부정행위가 발생한 횟수입니다.
            -   차트 데이터 셋의 라벨은 데이터 셋 타입을 사용하시면 됩니다.
        -  차트 라벨 :
            -   차트의 가로축에 사용될 라벨 입니다. 시험 시간(예시: 17:50, 오후 2:20)을 의미하며 총 시험 시간에 따라 라벨의 값이 달라집니다.
            -   최소 5 개, 최대 20 개가 존재 하게끔 계산하여 라벨 값을 정해야 합니다.
        -  바 색상, 넓이나 차트의 배경 색상 같은 자잘한 구성은 마음대로 하시면 됩니다.
2. **표 :**
    -   table 태그를 이용해 표를 구현해주세요.
    -   가로 축으로는 ['gaze_off_screen', 'window_switch', "audio_noise", "multiple_faces", 'prohibited_item_detected', 'proctor_snapshot', 'manual_flag'] 를 사용해주세요.
    -   세로 축으로는 시험에 참여한 응시자들의 이름을 나열해주세요. 특정 응시자만 골라서 조회하는 경우도 똑같이 이름을 쓰시면 됩니다.
    -   표의 값은 세로 축의 응시자가 가로 축의 부정 행위를 시험 중에 발생시킨 횟수입니다.
### 상단 (위에서 부터 40% 공간을 차지합니다)
3. **드롭 다운 :**
    -   전체 응시자의 부정행위 조회가 기본 값입니다. 시험에 실제로 참가한 응시자만 존재합니다.
    -   여기에서 조회할 응시자를 특정할 수 있습니다.
4. **EventLog 내용을 보여주는 블록? :**
    -   표, 차트의 특정 라벨이나 값을 클릭하지 않으면 나타나지 않습니다.
    -   EventLog 값을 보여주는 공간과 특정 조건으로 가져온 EventLog 들을 고를 수 있는 버튼들로 구성 된 박스로 이뤄져있습니다.
    -   **EventLog 버튼 박스 :**
        -   EventLog 값을 보여주는 공간 위에 존재하며 스크롤을 사용해 여러 EventLog 버튼을 보여줍니다.
        -   버튼에는 응시자, 발생 시간만 나와 있어야 합니다.
        -   이 버튼을 누르면 EventLog 값을 보여주는 공간이 눌러진 EventLog 값으로 변합니다.
    -   **EventLog 값을 보여주는 공간 :**
        -   위에서 설명했듯, 눌려진 EventLog 값을 보여줍니다.
        -   screenshot_url 경로에 이미지를 요청하고 받은 이미지를 실제로 화면에 렌더링 해야 합니다. 이게 바로 상단의 컴포넌트가 40% 의 공간을 차지하는 이유입니다.
    -   특정 시간대에 발생한 모든 EventLog, 특정 응시자가 시험 중에 발생시킨 모든 EventLog 등을 찾는 기능을 제공 해야 하므로 캐시 사용을 추천 합니다.

**!주의!** : 동명이인이 존재할 가능성이 있으니, 표, 차트 작성시 userId 를 어떻게든 끼워 넣는다던가 EventLog 조회 시 userId 까지 조건에 추가하는 로직을 구현하셔야 합니다.
            물론, 응시자 이름 뒤에 숫자를 붙이는 방법도 고려하고 있지만, 일단 구현은 userId 까지 고려하는 로직을 사용하세요.

### 리포트 대시보드의 서버 요청 흐름 :
1. 시험이 완료된 직후, `리포트` 버튼이 활성화 됩니다.
2. 감독관이 리포트 대시보드로 이동합니다.
    -   프론트엔드 서버 :
        -   리포트 대시보드로 이동하는 즉시 `GET /api/reports/{examId}` 요청을 보내 시험 중에 발생한 모든 EventLog 내용을 가져옵니다.(JWT 토큰, session_id 전부 헤더 쿠키에 있어야 합니다)
    -   벡엔드 서버 :
        -   exam_id, session_id 값을 가진 ExamSession 이 존재하는지 확인합니다.
        -   `supervisor` 권한만 받는 JWT 토큰 검증 과정의 결과인 user_info 의 id 가 ExamSession.proctor_ids 에 존재하는지 확인합니다.
        -   존재한다면 event_log_crud 를 통해 `EventLog.exam_id == exam_id` 인 EventLog 를 전부 가져옵니다.
        -   `Examinee.session_id == session_id && Examinee.exam_id == exam_id` 조건으로 실제 시험 응시자 정보를 가져옵니다.
        -   EventLog 들과 {str(Examinee.examinee.id), Examinee.examinee.name} 들을 모아 프론트엔드 서버에 전달합니다.
3. 상단의 드롭 다운은 {str(Examinee.examinee.id), Examinee.examinee.name} 값들을 매핑 합니다. EventLog 내용을 보여주는 블록은 전체 조회시 표시되지 않습니다. 오로지 표, 차트의 특정 값 혹은 라벨을 클릭해야 표시됩니다.
4. 하단의 표와 차트는 EventLog 내용을 사용 합니다. EventLog.examinee.examinee 값이 바로 User 입니다. 조건 처리할 때 유용하게 사용하실 수 있을 겁니다. 자세한 내용은 `backend/db/models.py` 파일을 참고하시기 바랍니다.
*/
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
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

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const EVENT_TYPES = [
  'gaze_off_screen',
  'window_switch',
  'audio_noise',
  'multiple_faces',
  'prohibited_item_detected',
  'proctor_snapshot',
  'manual_flag',
];

// Lightweight dev mock (used only if API fails)
const mockFetchReport = async (examId) => {
  return {
    event_logs: [
      {
        id: '1',
        exam_id: examId,
        examinee: { examinee: { id: 'user1', name: 'Alice' } },
        event_type: 'gaze_off_screen',
        generated_at: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
        screenshot_url: 'https://via.placeholder.com/640x480.png?text=Event+1',
      },
      {
        id: '2',
        exam_id: examId,
        examinee: { examinee: { id: 'user2', name: 'Bob' } },
        event_type: 'window_switch',
        generated_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        screenshot_url: 'https://via.placeholder.com/640x480.png?text=Event+2',
      },
      {
        id: '3',
        exam_id: examId,
        examinee: { examinee: { id: 'user1', name: 'Alice' } },
        event_type: 'audio_noise',
        generated_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
        screenshot_url: 'https://via.placeholder.com/640x480.png?text=Event+3',
      },
      {
        id: '4',
        exam_id: examId,
        examinee: { examinee: { id: 'user3', name: 'Charlie' } },
        event_type: 'multiple_faces',
        generated_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
        screenshot_url: 'https://via.placeholder.com/640x480.png?text=Event+4',
      },
      {
        id: '5',
        exam_id: examId,
        examinee: { examinee: { id: 'user2', name: 'Bob' } },
        event_type: 'gaze_off_screen',
        generated_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        screenshot_url: 'https://via.placeholder.com/640x480.png?text=Event+5',
      },
    ],
    examinees: [
      { id: 'user1', name: 'Alice' },
      { id: 'user2', name: 'Bob' },
      { id: 'user3', name: 'Charlie' },
    ],
    exam_start_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    exam_end_time: new Date().toISOString(),
  };
};

const ReportDashboard1 = () => {
  const { examId } = useParams();
  const [eventLogs, setEventLogs] = useState([]);
  const [examinees, setExaminees] = useState([]);
  const [examTime, setExamTime] = useState({ start: null, end: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedUserId, setSelectedUserId] = useState('all');
  const [viewMode, setViewMode] = useState('chart'); // 'chart' | 'table'
  const [activeEventLogs, setActiveEventLogs] = useState([]);
  const [selectedEventLog, setSelectedEventLog] = useState(null);

  // Simple in-memory cache for filtered queries
  const cacheRef = useRef(new Map());

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`/api/reports/${examId}`);
        const data = res.data || {};
        setEventLogs(Array.isArray(data.event_logs) ? data.event_logs : []);
        const exs = Array.isArray(data.examinees) ? data.examinees : [];
        const unique = new Map(exs.map((e) => [e.id, e.name]));
        setExaminees(Array.from(unique, ([id, name]) => ({ id, name })));

        // Support multiple key names
        const start = data.exam_start_time;
        const end = data.exam_end_time;
        setExamTime({ start, end });
      } catch (e) {
        console.warn('Falling back to mock report data due to fetch error:', e?.message);
        const data = await mockFetchReport(examId);
        setEventLogs(data.event_logs);
        setExaminees(data.examinees);
        setExamTime({ start: data.exam_start_time, end: data.exam_end_time });
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [examId]);

  const filteredLogsByUser = useMemo(() => {
    if (selectedUserId === 'all') return eventLogs;
    return eventLogs.filter((l) => String(l?.examinee?.examinee?.id) === String(selectedUserId));
  }, [eventLogs, selectedUserId]);

  const getCachedLogs = (key, computeFn) => {
    const cache = cacheRef.current;
    if (cache.has(key)) return cache.get(key);
    const val = computeFn();
    cache.set(key, val);
    return val;
  };

  const handleOpenLogs = (logs) => {
    setActiveEventLogs(logs);
    setSelectedEventLog(logs && logs.length ? logs[0] : null);
  };

  if (loading) return <div>Loading report...</div>;
  if (error) return <div>{error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <h2 style={{ margin: '8px 0 4px' }}>Exam Report: {examId}</h2>

      {/* Top: 40% */}
      <div style={{ flex: '0 0 40%', border: '1px solid #ddd', padding: 10, display: 'flex', gap: 12, minHeight: 280 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="examinee-select">Examinee: </label>
          <select
            id="examinee-select"
            value={selectedUserId}
            onChange={(e) => {
              setSelectedUserId(e.target.value);
              setActiveEventLogs([]);
              setSelectedEventLog(null);
            }}
            style={{ marginLeft: 6 }}
          >
            <option value="all">All Examinees</option>
            {examinees.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 3, border: '1px solid #eee', padding: 10, display: 'flex', gap: 10 }}>
          {activeEventLogs.length ? (
            <>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <strong>Event Logs</strong>
                <div style={{ marginTop: 8 }}>
                  {activeEventLogs.map((log) => (
                    <button
                      key={log.id}
                      onClick={() => setSelectedEventLog(log)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6 }}
                    >
                      {(log?.examinee?.examinee?.name || 'Unknown')} -
                      {' '}
                      {new Date(log.generated_at || log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 2, borderLeft: '1px solid #ddd', paddingLeft: 10 }}>
                {selectedEventLog ? (
                  <div>
                    <div style={{ marginBottom: 8 }}>
                      <strong>Examinee:</strong> {selectedEventLog?.examinee?.examinee?.name}
                      {' '}(<code>{selectedEventLog?.examinee?.examinee?.id}</code>)
                    </div>
                    <div><strong>Event:</strong> {selectedEventLog?.event_type}</div>
                    <div style={{ marginBottom: 8 }}>
                      <strong>Time:</strong> {new Date(selectedEventLog.generated_at || selectedEventLog.timestamp).toLocaleString()}
                    </div>
                    {selectedEventLog?.screenshot_url ? (
                      <img
                        src={selectedEventLog.screenshot_url}
                        alt="Event Screenshot"
                        style={{ maxWidth: '100%', height: 'auto', border: '1px solid #ccc' }}
                      />
                    ) : (
                      <em>No screenshot available.</em>
                    )}
                  </div>
                ) : (
                  <div>Select an event to see details.</div>
                )}
              </div>
            </>
          ) : (
            <div style={{ alignSelf: 'center' }}>Click a chart bar/label or a table cell to load logs.</div>
          )}
        </div>
      </div>

      {/* Bottom: 60% */}
      <div style={{ flex: '0 0 60%', padding: 10, display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: 8 }}>
          <button onClick={() => setViewMode('chart')} disabled={viewMode === 'chart'}>차트</button>
          <button onClick={() => setViewMode('table')} disabled={viewMode === 'table'} style={{ marginLeft: 6 }}>표</button>
        </div>
        <div style={{ flex: 1, minHeight: 320 }}>
          {viewMode === 'chart' ? (
            <TimeBucketBarChart
              eventLogs={filteredLogsByUser}
              examTime={examTime}
              selectedUserId={selectedUserId}
              onPick={handleOpenLogs}
              getCachedLogs={getCachedLogs}
            />
          ) : (
            <CheatEventsTable
              eventLogs={eventLogs}
              examinees={examinees}
              selectedUserId={selectedUserId}
              onPick={handleOpenLogs}
              getCachedLogs={getCachedLogs}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const toDate = (v) => (v ? new Date(v) : null);

const computeTimeLabels = (startISO, endISO) => {
  const start = toDate(startISO);
  const end = toDate(endISO);
  if (!start || !end || !(end > start)) return { labels: [], edges: [] };
  const durationMin = (end - start) / (1000 * 60);

  // Choose interval so label count is between 5 and 20
  let interval = Math.max(1, Math.round(durationMin / 10)); // target ~10 labels
  let count = Math.floor(durationMin / interval) + 1;
  if (count > 20) {
    interval = Math.ceil(durationMin / 20);
    count = Math.floor(durationMin / interval) + 1;
  } else if (count < 5) {
    interval = Math.max(1, Math.floor(durationMin / 5));
    count = Math.floor(durationMin / interval) + 1;
  }

  const labels = [];
  const edges = []; // bucket boundaries
  const current = new Date(start);
  for (let i = 0; i < count; i++) {
    labels.push(current.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    edges.push(new Date(current));
    current.setMinutes(current.getMinutes() + interval);
  }
  // Ensure last edge at end
  if (edges[edges.length - 1] < end) edges.push(new Date(end));
  return { labels, edges };
};

const bucketIndexForTime = (dateObj, edges) => {
  if (!dateObj || !edges || edges.length === 0) return -1;
  for (let i = 0; i < edges.length - 1; i++) {
    if (dateObj >= edges[i] && dateObj < edges[i + 1]) return i;
  }
  // include exact end
  if (dateObj.getTime() === edges[edges.length - 1].getTime()) return edges.length - 2;
  return -1;
};

const TimeBucketBarChart = ({ eventLogs, examTime, selectedUserId, onPick, getCachedLogs }) => {
  const chartRef = useRef(null);
  const { labels, edges } = useMemo(() => computeTimeLabels(examTime.start, examTime.end), [examTime]);

  // Precompute counts per dataset per bucket
  const datasets = useMemo(() => {
    const countsByType = EVENT_TYPES.map(() => Array(Math.max(1, labels.length)).fill(0));
    (eventLogs || []).forEach((log) => {
      const t = new Date(log.generated_at || log.timestamp);
      const idx = bucketIndexForTime(t, edges);
      if (idx >= 0) {
        const typeIdx = EVENT_TYPES.indexOf(log.event_type);
        if (typeIdx >= 0) countsByType[typeIdx][idx] += 1;
      }
    });
    const palette = [
      'rgba(54, 162, 235, 0.6)',
      'rgba(255, 99, 132, 0.6)',
      'rgba(255, 206, 86, 0.6)',
      'rgba(75, 192, 192, 0.6)',
      'rgba(153, 102, 255, 0.6)',
      'rgba(255, 159, 64, 0.6)',
      'rgba(99, 255, 132, 0.6)',
    ];
    return EVENT_TYPES.map((type, i) => ({
      label: type,
      data: countsByType[i],
      backgroundColor: palette[i % palette.length],
      stack: 'events',
    }));
  }, [eventLogs, labels.length, edges]);

  const data = useMemo(() => ({ labels, datasets }), [labels, datasets]);

  const logsFor = (bucketIdx, type) => {
    const key = JSON.stringify({ k: 'logsFor', bucketIdx, type: type || 'all', user: selectedUserId });
    return getCachedLogs(key, () => {
      const start = edges[bucketIdx];
      const end = edges[bucketIdx + 1] || edges[bucketIdx];
      return (eventLogs || []).filter((log) => {
        const ts = new Date(log.generated_at || log.timestamp);
        if (!(ts >= start && ts < end)) return false;
        if (type && log.event_type !== type) return false;
        if (selectedUserId !== 'all' && String(log?.examinee?.examinee?.id) !== String(selectedUserId)) return false;
        return true;
      });
    });
  };

  const onClick = (evt, elements, chart) => {
    // If a bar element is clicked
    if (elements && elements.length) {
      const first = elements[0];
      const bucketIdx = first.index; // x index
      const dsIdx = first.datasetIndex;
      const type = EVENT_TYPES[dsIdx];
      const logs = logsFor(bucketIdx, type);
      onPick(logs);
      return;
    }
    // Else, attempt to detect x-axis label click
    const c = chart || chartRef.current;
    if (!c) return;
    const xScale = c.scales?.x;
    const yScale = c.scales?.y;
    const mouseX = evt?.offsetX ?? evt?.native?.offsetX ?? 0;
    const mouseY = evt?.offsetY ?? evt?.native?.offsetY ?? 0;
    if (!xScale || !yScale) return;
    // Consider a band near the axis labels
    const nearAxis = mouseY > yScale.bottom && mouseY < yScale.bottom + 40;
    if (!nearAxis) return;
    let closestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < labels.length; i++) {
      const px = xScale.getPixelForTick(i);
      const d = Math.abs(px - mouseX);
      if (d < minDist) {
        minDist = d;
        closestIdx = i;
      }
    }
    const logs = logsFor(closestIdx, null);
    onPick(logs);
  };

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Cheating Events over Time' },
      tooltip: { mode: 'index', intersect: false },
    },
    interaction: { mode: 'nearest', intersect: true },
    onClick,
    scales: {
      x: { stacked: true },
      y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
    },
  }), [labels]);

  return <Bar ref={chartRef} options={options} data={data} />;
};

const CheatEventsTable = ({ eventLogs, examinees, selectedUserId, onPick, getCachedLogs }) => {
  const displayExaminees = useMemo(() => {
    return selectedUserId === 'all' ? examinees : examinees.filter((e) => String(e.id) === String(selectedUserId));
  }, [examinees, selectedUserId]);

  const logsForCell = (exId, type) => {
    const key = JSON.stringify({ k: 'tableCell', exId, type });
    return getCachedLogs(key, () => (eventLogs || []).filter((l) => String(l?.examinee?.examinee?.id) === String(exId) && l.event_type === type));
  };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Examinee</th>
          {EVENT_TYPES.map((t) => (
            <th key={t} style={{ border: '1px solid #ddd', padding: 8 }}>{t}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {displayExaminees.map((ex) => (
          <tr key={ex.id}>
            <td style={{ border: '1px solid #ddd', padding: 8 }}>{ex.name} <small>({ex.id})</small></td>
            {EVENT_TYPES.map((t) => {
              const logs = logsForCell(ex.id, t);
              return (
                <td
                  key={t}
                  style={{ border: '1px solid #ddd', padding: 8, textAlign: 'center', cursor: logs.length ? 'pointer' : 'default' }}
                  onClick={() => logs.length && onPick(logs)}
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

export default ReportDashboard1;
