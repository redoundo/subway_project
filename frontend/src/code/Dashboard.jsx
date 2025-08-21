import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import useStatusStore from './store/statusStore.js'; // Import the Zustand store
import '../css/DashBoard.css';

// Helper component for displaying a single exam
const ExamCard = ({ exam, userType }) => {
    const navigate = useNavigate();
    const { preCheckCompleted } = useStatusStore();
    const handleCreateSession = (examId) => {
        // Logic to create a session
        console.log(`Creating session for exam ${examId}`);
        // Example API call:
        axios.post(`/api/exams/${examId}/create_session`)
          .then(response => alert(response.data + 'Session created and invitations sent!'))
          .catch(error => console.error('Failed to create session', error));
    };

    const handleEditExam = (examId) => {
        navigate(`/admin/exam/edit/${examId}`);
    };

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
            <h3>{exam.name}</h3>
            <p>Start Time: {new Date(exam.startTime).toLocaleString()}</p>
            <p>End Time: {new Date(exam.endTime).toLocaleString()}</p>
            <div className="exam-card-actions">
                {userType === 'admin' && (
                    <>
                        <button className="btn btn-secondary" onClick={() => handleEditExam(exam.id)}>Edit Info</button>
                        <button className="btn btn-primary" onClick={() => handleCreateSession(exam.id)}>Create Session</button>
                    </>
                )}
                {userType === 'examinee' && (
                    <>
                        <button className="btn btn-secondary" onClick={() => handlePreCheck(exam.id)}>Pre-Check</button>
                        {
                            preCheckCompleted ?
                                <button className="btn btn-primary" disabled={exam.session_status !== "ready"} onClick={() => handleEnterExam(exam.id)}>
                                    Enter
                                </button>
                                : null
                        }
                    </>
                )}
                {userType === 'proctor' && (
                     <button className="btn btn-primary" onClick={() => handleEnterMonitoring(exam.id)}>Enter</button>
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
    const [exams, setExams] = useState([]);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        const fetchExams = async () => {
            try {
                const token = localStorage.getItem('token');
                const response = await axios.get('/api/exams/admin', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setExams(response.data);
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
                {exams.length > 0 ? (
                    exams.map(exam => <ExamCard key={exam.id} exam={exam} userType="admin" />)
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
    const [exams, setExams] = useState([]);
    const [error, setError] = useState('');
    useEffect(() => {
        const fetchExams = async () => {
            try {
                const token = localStorage.getItem('token');
                // 응시 가능한 시험 정보들을 가져옵니다.
                const response = await axios.get('/api/exams/examinee', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                // Check local storage for pre-check status
                const examsWithStatus = response.data.map(exam => ({
                    ...exam
                }));
                setExams(examsWithStatus);
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
                {exams.length > 0 ? (
                    exams.map(exam => <ExamCard key={exam.id} exam={exam} userType="examinee" />)
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
    const [exams, setExams] = useState([]);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchExams = async () => {
            try {
                const token = localStorage.getItem('token');
                // This API endpoint is an assumption based on the documentation.
                const response = await axios.get('/api/exams/supervisor', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setExams(response.data);
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
                {exams.length > 0 ? (
                    exams.map(exam => <ExamCard key={exam.id} exam={exam} userType="proctor" />)
                ) : (
                    <p>You have no exams to supervise at the moment.</p>
                )}
            </div>
        </div>
    );
};
