import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import useStatusStore from './store/statusStore.js'; // Import the Zustand store
import '../css/DashBoard.css';

// New Admin component for mixed exam/session items
const AdminExamItem = ({ item }) => {
    const navigate = useNavigate();
    const [showRules, setShowRules] = useState(false);
    const [detectRule, setDetectRule] = useState({
        detect_gaze_off_screen: false,
        detect_window_switch: false,
        detect_prohibited_items: false,
        detect_multiple_faces: false,
        detect_audio_noise: false,
    });

    const isExam = item.statusType === 'exam';
    const isSession = item.statusType === 'session';

    const examTitle = item.exam_title;
    const startStr = item.exam_start_datetime ? new Date(item.exam_start_datetime).toLocaleString() : '';
    const endStr = item.exam_end_datetime ? new Date(item.exam_end_datetime).toLocaleString() : '';

    const handleEditExam = (examId) => navigate(`/admin/exam/edit/${examId}`);

    const toggleRule = (key) => setDetectRule(prev => ({ ...prev, [key]: !prev[key] }));
    const anyRuleChecked = Object.values(detectRule).some(Boolean);

    const handleCreateSession = async (examId) => {
        try {
            const jwtToken = localStorage.getItem('jwt_token');
            await axios.post(`/sessions/${examId}/create_session`, detectRule, {
                headers: { 'Content-Type': 'application/json', 'jwt_token': jwtToken },
                withCredentials: true,
            });
            alert('Session created and invitations sent!');
        } catch (e) {
            console.error('Failed to create session', e);
            alert('Failed to create session');
        }
    };

    const ruleLabels = [
        { key: 'detect_gaze_off_screen', label: '시선 화면 이탈' },
        { key: 'detect_window_switch', label: '창 전환' },
        { key: 'detect_prohibited_items', label: '금지 물품' },
        { key: 'detect_multiple_faces', label: '응시자 외 인원' },
        { key: 'detect_audio_noise', label: '소음 감지' },
    ];

    const enabledRules = isSession && item.detection_rule
        ? ruleLabels.filter(r => item.detection_rule[r.key]).map(r => r.label)
        : [];

    return (
        <div className="exam-card">
            <h3>{examTitle}</h3>
            <p>Start Time: {startStr}</p>
            <p>End Time: {endStr}</p>

            <div className="exam-card-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {isSession && enabledRules.length > 0 && (
                    <span className="rule-badges">
                        {enabledRules.join(' · ')}
                    </span>
                )}
                <button className="btn btn-secondary" onClick={() => handleEditExam(item.exam_id)}>Edit Info</button>

                {isExam && (
                    <>
                        <button className="btn" onClick={() => setShowRules(v => !v)}>부정 행위 종류 설정</button>
                        <button className="btn btn-primary" disabled={!anyRuleChecked} onClick={() => handleCreateSession(item.exam_id)}>
                            Create Session
                        </button>
                    </>
                )}
            </div>

            {isExam && showRules && (
                <div className="rule-selector" style={{ marginTop: '10px' }}>
                    {ruleLabels.map(r => (
                        <label key={r.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 12, color: "black" }}>
                            <input type="checkbox" checked={detectRule[r.key]} onChange={() => toggleRule(r.key)} />
                            <span>{r.label}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

/*
# 요청:
## ExamCard 에 있는 Pre-Check 과정을 ExamCard 가 아닌 다른 컴포넌트에서 처리할 수 있게 만들어주세요.

ExamCard 에 있는 handlePreCheck 와 <button className="btn btn-secondary" onClick={() => handlePreCheck(exam.exam._id)}>Pre-Check</button> 를
<div className="dashboard-header"> 내부로 옮겨주시면 됩니다.
 */

// Helper component for displaying a single exam
const ExamCard = ({ exam, userType }) => {
    const navigate = useNavigate();
    const { preCheckCompleted } = useStatusStore();
    const handlePreCheck = (examId) => {
        navigate(`/examinee/pre-check/${examId}`);
    };

    const handleEnterExam = (examId) => {
        // Logic for examinee to enter the exam session session_status
        console.log(`Examinee entering exam ${examId}`);
        navigate(`/examinee/exam-session/${examId}`);
    };
    
    const handleEnterMonitoring = (examId) => {
        // Logic for proctor to enter the monitoring session
        console.log(`Proctor entering monitoring for exam ${examId}`);
        navigate(`/proctor/monitoring/${examId}`);
    }

    return (
        <div className="exam-card">
            <h3>
                {exam.exam.exam_title}
            </h3>
            <p> Start Time: {new Date(exam.exam.exam_start_datetime).toLocaleString()} </p>
            <p> End Time: {new Date(exam.exam.exam_end_datetime).toLocaleString()} </p>
            <div className="exam-card-actions">
                {userType === 'examinee' && (
                    <>
                        <button className="btn btn-secondary" onClick={() => handlePreCheck(exam.exam._id)}>Pre-Check</button>
                        {
                            preCheckCompleted ? // TODO : exam.session_status 를 어떻게 업데이트하지?
                                <button className="btn btn-primary" disabled={exam.session_status !== "ready"} onClick={() => handleEnterExam(exam.exam._id)}>
                                    Enter
                                </button>
                                : null
                        }
                    </>
                )}
                {userType === 'proctor' && (
                     <button className="btn btn-primary" onClick={() => handleEnterMonitoring(exam.exam._id)}>Enter</button>
                )}
            </div>
        </div>
    );
};


/**
 * AdminDashboard Component
 * Fetches and displays exams for the administrator.
 */
export const AdminDashboard = () => {
    const [items, setItems] = useState([]);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        const fetchExams = async () => {
            try {
                const jwtToken = localStorage.getItem('jwt_token');
                const response = await axios.get('/exams/admin', {
                    headers: { "jwt_token" : jwtToken}, withCredentials: true
                });
                const data = response.data || {};
                const examItems = Array.isArray(data.exam) ? data.exam.map(e => ({ statusType: 'exam', ...e })) : [];
                const sessionItems = Array.isArray(data.session) ? data.session.map(s => ({ statusType: 'session', ...s })) : [];
                setItems([...examItems, ...sessionItems]);
            } catch (err) {
                console.error('Failed to fetch exams:', err);
                setError('Failed to load exams. Please try again later.');
            }
        };
        fetchExams();
    }, []);

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>Admin Dashboard</h1>
                <button className="btn btn-primary" onClick={() => navigate('/admin/exam/create')}>Create Exam</button>
            </div>
            {error && <p className="error-message">{error}</p>}
            <div className="exam-list">
                {items.length > 0 ? (
                    items.map((it) => (
                        <AdminExamItem key={(it.statusType === 'session' ? it.session_id : it.exam_id)} item={it} />
                    ))
                ) : (
                    <p>No exams found.</p>
                )}
            </div>
        </div>
    );
};

/**
 * ExamineeDashboard Component
 * Fetches and displays exams for the examinee.
 */
export const ExamineeDashboard = () => {
    const [sessions, setSessions] = useState([]);
    const [error, setError] = useState('');
    useEffect(() => {
        const fetchExams = async () => {
            try {
                const jwtToken = localStorage.getItem('jwt_token');
                // 응시 가능한 시험 정보들을 가져옵니다.
                const response = await axios.get('/exams/examinee', {
                    headers: { "jwt_token" : jwtToken}, withCredentials: true
                });
                // Check local storage for pre-check status
                const examSessionsWithStatus = response.data.map(examSession => ({
                    ...examSession
                }));
                setSessions(examSessionsWithStatus);
            } catch (err) {
                console.error('Failed to fetch exams:', err);
                setError('Failed to load your exams. Please try again later.');
            }
        };
        fetchExams();
    }, []);

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>My Exams</h1>
            </div>
            {error && <p className="error-message">{error}</p>}
            <div className="exam-list">
                {sessions.length > 0 ? (
                    sessions.map(session => <ExamCard key={session._id} exam={session} userType="examinee" />)
                ) : (
                    <p>You are not registered for any upcoming exams.</p>
                )}
            </div>
        </div>
    );
};

/**
 * ProctorDashboard Component
 * Fetches and displays exams for the proctor.
 */
export const ProctorDashboard = () => {
    const [sessions, setSessions] = useState([]);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchExams = async () => {
            try {
                const jwtToken = localStorage.getItem('jwt_token');
                // This API endpoint is an assumption based on the documentation.
                const response = await axios.get('/exams/supervisor', {
                    headers: { "jwt_token" : jwtToken}, withCredentials: true
                });
                setSessions(response.data);
            } catch (err) {
                console.error('Failed to fetch exams:', err);
                setError('Failed to load your assigned exams. Please try again later.');
            }
        };
        fetchExams();
    }, []);

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>My Supervised Exams</h1>
            </div>
            {error && <p className="error-message">{error}</p>}
            <div className="exam-list">
                {sessions.length > 0 ? (
                    sessions.map(session => <ExamCard key={session.session_id} exam={session} userType="proctor" />)
                ) : (
                    <p>You have no exams to supervise at the moment.</p>
                )}
            </div>
        </div>
    );
};
