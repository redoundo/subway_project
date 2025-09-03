import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import websocketManager, { SERVER_URLS } from './WebsocketUtils';
import '../css/MonitoringDashboard.css';

// Video stream player component
const StreamPlayer = ({ user, stream, onSendMessage }) => {
    const videoRef = useRef(null);
    const [isHovering, setIsHovering] = useState(false);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <div
            className={`stream-player ${!stream ? 'no-stream' : ''}`}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
        >
            <video ref={videoRef} autoPlay playsInline muted />
            <div className="user-info">{user.name || `Examinee ${user.id}`}</div>
            {stream && isHovering && (
                <button className="btn btn-primary send-message-btn" onClick={() => onSendMessage(user)}>
                    Send Message
                </button>
            )}
             {/* Add more overlay elements for alerts if needed */}
        </div>
    );
};


// Main Monitoring Dashboard component
const MonitoringDashboard = () => {
    const { examId } = useParams();
    const navigate = useNavigate();
    const [exam, setExam] = useState(null);
    const [examinees, setExaminees] = useState(new Map()); // Map<userId, {user, stream}>
    const [message, setMessage] = useState('');
    const [recipients, setRecipients] = useState([]); // Array of user objects
    const [error, setError] = useState('');

    // Fetch exam details and connect to services on component mount
    useEffect(() => {
        const setupMonitoring = async () => {
            try {
                const jwtToken = localStorage.getItem('jwt_token');
                // 현재 들어온 시험 세션 정보를 가져옵니다.
                const examDetailsResponse = await axios.get(`/exams/get_exam/${examId}`, {
                     headers: { jwt_token: jwtToken }, withCredentials: true
                });
                const fetchedExam = examDetailsResponse.data;
                setExam(fetchedExam);
                console.log(fetchedExam);
                // Initialize examinees map from the expected list
                const initialExaminees = new Map();
                fetchedExam.expected_examinees.forEach(ex => {
                    initialExaminees.set(ex._id, { user: ex, stream: null });
                });
                
                // Join session and get session_id cookie
                const res = await axios.get(`/sessions/supervisor_join_session/${examId}`, {
                    headers: { jwt_token: jwtToken }, withCredentials: true
                });
                console.log(res);
                // TODO: 서버에서 fastapi.Response.set_cookie(key="session_id", value=session.session_id) 를 해주고는 있지만, 개발자 창을 보면 아무 쿠키가 없습니다...path 의 문제일 가능성이 높다고 생각합니다.
                localStorage.setItem('session_id', res.data.session_id);

                // Connect to media server
                await websocketManager.connect(SERVER_URLS.MEDIA_SERVER_URL, examId);
                await websocketManager.loadDevice();
                // TODO: 불필요한 코드입니다. react-cookie 도입이 시급. axios 요청을 보낼 때 특정 flag 로 사용할 쿠키를 조절하거나 추가 여부를 결정할 수 있는 방법을 모색해야 합니다.
                const sessionId = localStorage.getItem('session_id');
                // Get already connected examinees and subscribe to their streams
                const connectedExamineesResponse = await axios.get(`/sessions/${examId}/examinees`, {
                    headers: { jwt_token: jwtToken, session_id: sessionId }, withCredentials: true
                });
                
                const connectedIds = connectedExamineesResponse.data.map(ex => ex._id);
                if (connectedIds.length > 0) {
                    const streamsMap = await websocketManager.subscribe(connectedIds);
                    streamsMap.forEach((value, key) => {
                        const existing = initialExaminees.get(key);
                        if (existing) {
                            initialExaminees.set(key, { ...existing, stream: value.stream });
                        }
                    });
                }
                
                setExaminees(new Map(initialExaminees));


                // Connect to backend websocket for real-time updates
                await websocketManager.connect(SERVER_URLS.BACKEND_SERVER_URL, examId);
                websocketManager.backendSocket.on('message', async (event) => {
                    if (event.type === 'examinee_connected' && event.userId) {
                        const newUserId = event.userId;
                        // Check if we don't already have a stream for this user
                        if (examinees.has(newUserId) && !examinees.get(newUserId).stream) {
                            const streamMap = await websocketManager.subscribe([newUserId]);
                            if (streamMap.has(newUserId)) {
                                setExaminees(prev => {
                                    const newMap = new Map(prev);
                                    const existing = newMap.get(newUserId);
                                    newMap.set(newUserId, { ...existing, stream: streamMap.get(newUserId).stream });
                                    return newMap;
                                });
                            }
                        }
                    }
                    // Handle other events like 'cheating_detected'
                    if (event.type === 'cheating_detected') {
                        // Visual alert logic here
                        console.log(`Cheating detected for user: ${event.userId}`);
                    }
                });

            } catch (err) {
                console.error('Failed to setup monitoring session:', err);
                setError('Failed to setup monitoring session. Please try again.');
            }
        };

        setupMonitoring();

        // Cleanup on unmount
        return () => {
            websocketManager.disconnect();
        };
    }, [examId]);

    const handleAddRecipient = (user) => {
        if (!recipients.find(r => r._id === user._id)) {
            setRecipients([...recipients, user]);
        }
    };

    const handleRemoveRecipient = (userId) => {
        setRecipients(recipients.filter(r => r._id !== userId));
    };

    const handleSendMessage = () => {
        if (!message.trim()) return;

        const payload = {
            message,
            // If recipients array is empty, message is broadcast to all
            target_users: recipients.map(r => r._id)
        };

        // Assuming the backend socket uses a 'send_message' event
        websocketManager.backendSocket.emit('send_message', payload);
        setMessage('');
        setRecipients([]); // Clear recipients after sending
    };

    if (error) {
        return <div className="monitoring-container error-page">{error}</div>;
    }

    if (!exam) {
        return <div className="monitoring-container loading-page">Loading Monitoring Session...</div>;
    }

    return (
        <div className="monitoring-container">
            <aside className="sidebar">
                <button className="btn sidebar-btn active" onClick={() => navigate(`/proctor/monitoring/${examId}`)}>
                    Monitoring
                </button>
                <button className="btn sidebar-btn" disabled>
                    Report
                </button>
            </aside>
            <main className="main-content">
                <div className="streams-grid">
                    {Array.from(examinees.values()).map(({ user, stream }) => (
                        <StreamPlayer
                            key={user._id}
                            user={user}
                            stream={stream}
                            onSendMessage={handleAddRecipient}
                        />
                    ))}
                </div>
            </main>
            <footer className="message-footer">
                <div className="recipients-bar">
                    <span className="label">To:</span>
                    {recipients.length > 0 ? (
                        recipients.map(user => (
                            <span key={user._id} className="recipient-tag">
                                {user.name}
                                <button onClick={() => handleRemoveRecipient(user._id)}>x</button>
                            </span>
                        ))
                    ) : (
                        <span className="placeholder">All Examinees</span>
                    )}
                </div>
                <div className="message-input-bar">
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Type your message here..."
                    />
                    <button className="btn btn-primary" onClick={handleSendMessage} disabled={!message.trim()}>
                        Send
                    </button>
                </div>
            </footer>
        </div>
    );
};

export default MonitoringDashboard;