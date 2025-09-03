import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import useExamStore, {useExamAnswerStore} from './store/examStore.js';
import '../css/ExamPage.css';
import websocketManager, { SERVER_URLS } from './WebsocketUtils';



// --- Sub-components ---

const Toolbar = () => {
    const exam_meta = useExamStore(state => state.exam_meta);
    const getCurrentSchedule = useExamStore(state => state.getCurrentSchedule);
    const legacy = useExamStore(state => state.examDetails);
    const [timeLeft, setTimeLeft] = useState('');

    const currentSchedule = useMemo(() => {
        try { return getCurrentSchedule ? getCurrentSchedule(new Date()) : null; } catch (_) { return null; }
    }, [getCurrentSchedule]);

    const title = exam_meta?.exam_title || legacy?.title || 'Exam';
    const period = currentSchedule ? `${currentSchedule.schedule_index}교시` : (legacy?.period || '');
    const endTime = currentSchedule?.end_datetime || legacy?.endTime || null;

    useEffect(() => {
        if (!endTime) return;
        const interval = setInterval(() => {
            const now = new Date();
            const end = new Date(endTime);
            const diff = end - now;
            if (diff <= 0) {
                setTimeLeft('00:00:00');
                clearInterval(interval);
                return;
            }
            const hours = Math.floor(diff / (1000 * 60 * 60)).toString().padStart(2, '0');
            const minutes = Math.floor((diff / (1000 * 60)) % 60).toString().padStart(2, '0');
            const seconds = Math.floor((diff / 1000) % 60).toString().padStart(2, '0');
            setTimeLeft(`${hours}:${minutes}:${seconds}`);
        }, 1000);
        return () => clearInterval(interval);
    }, [endTime]);

    return (
        <div className="toolbar">
            <div className="toolbar-info">
                <h2>{title} ({period})</h2>
            </div>
            <div className="toolbar-timer">
                <p>Time Remaining</p>
                <span className="countdown">{timeLeft}</span>
            </div>
        </div>
    );
};

const Selections = ({ questionId, options, isBox }) => {
    const { answers, selectAnswer } = useExamStore();
    const selectedAnswers = answers[questionId] || [];

    return (
        <div className="selections">
            {options.map((opt, index) => (
                <button
                    key={index}
                    className={selectedAnswers.includes(index) ? 'selected' : ''}
                    onClick={() => selectAnswer(questionId, index)}
                >
                    {isBox ? index + 1 : opt}
                </button>
            ))}
        </div>
    );
};

const ExamQuestion = ({ question }) => {
    return (
        <div className="exam-question">
            <h3>{question.title}</h3>
            <div className="question-image">
                <img src={question.image} alt={question.title} />
            </div>
            <Selections questionId={question.id} options={question.options} />
        </div>
    );
};

const ExamQuestionSpace = () => {
    const questions = useExamStore(state => state.questions);
    return (
        <div className="exam-question-space">
            {questions.map(q => <ExamQuestion key={q.id} question={q} />)}
        </div>
    );
};

const AnswerIndexBox = ({ question }) => {
    return (
        <div className="answer-index-box">
            <p>{question.title}</p>
            <Selections questionId={question.id} options={question.options} isBox={true} />
        </div>
    );
};

const AnswerIndexSpace = () => {
    const questions = useExamStore(state => state.questions);
    return (
        <div className="answer-index-space">
            <h3>Answer Sheet</h3>
            {questions.map(q => <AnswerIndexBox key={q.id} question={q} />)}
        </div>
    );
};

// Render real exam paper using Shadow DOM and clickable overlays
const ExamPaper = () => {
    const getExamContentForCurrent = useExamStore(state => state.getExamContentForCurrent);
    const exam_meta = useExamStore(state => state.exam_meta);
    const answerStore = useExamAnswerStore();

    const wrapperRef = useRef(null);
    const hostRef = useRef(null);
    const shadowRef = useRef(null);
    const [content, setContent] = useState(null);
    const [overlays, setOverlays] = useState([]);

    // Resolve content for current schedule
    useEffect(() => {
        try {
            const { content: c } = getExamContentForCurrent({ now: new Date() });
            setContent(c || null);
        } catch (e) {
            console.error('Failed to resolve current exam content:', e);
            setContent(null);
        }
    }, [getExamContentForCurrent, exam_meta]);

    // Inject outer_html and pages into Shadow DOM
    useEffect(() => {
        if (!content || !hostRef.current) return;
        if (!shadowRef.current) {
            shadowRef.current = hostRef.current.attachShadow({ mode: 'open' });
        }
        const shadow = shadowRef.current;
        shadow.innerHTML = content.outer_html || '';
        const pageContainer = shadow.getElementById('page-container');
        if (pageContainer) {
            pageContainer.style.overflow = 'visible';
            const totalPages = (content.htmls || []).length || 1;
            pageContainer.style.height = `${Math.ceil(1548.3 * totalPages)}px`;
            pageContainer.innerHTML = (content.htmls || []).map(h => h.html).join('');
        }
    }, [content]);

    const recomputeOverlays = useCallback(() => {
        if (!content || !shadowRef.current || !wrapperRef.current) return;
        const shadow = shadowRef.current;
        const wrapper = wrapperRef.current;
        const wrapperRect = wrapper.getBoundingClientRect();
        const scrollX = wrapper.scrollLeft;
        const scrollY = wrapper.scrollTop;
        const items = [];
        const diff = 1.333321996963399; // Scale factor used in test drive
        for (const page of content.htmls || []) {
            const pageId = `pf${page.page_index}`;
            const pageEl = shadow.getElementById(pageId);
            if (!pageEl) continue;
            const pageRect = pageEl.getBoundingClientRect();
            const baseLeft = pageRect.left - wrapperRect.left + scrollX;
            const baseTop = pageRect.top - wrapperRect.top + scrollY;
            for (const q of page.questions || []) {
                for (const sel of q.selection || []) {
                    const { x0, y0 } = sel.location || {};
                    if (typeof x0 !== 'number' || typeof y0 !== 'number') continue;
                    const left = Math.floor(baseLeft + x0 / diff);
                    const top = Math.floor(baseTop + y0 / diff);
                    const width = 8;
                    const height = 8;
                    items.push({
                        id: `${q.question_id}-${sel.selection_index}-${page.page_index}`,
                        question_id: q.question_id,
                        selection_index: sel.selection_index,
                        page_index: page.page_index,
                        left, top, width, height,
                    });
                }
            }
        }
        setOverlays(items);
    }, [content]);

    useEffect(() => { recomputeOverlays(); }, [recomputeOverlays]);
    useEffect(() => {
        const onResize = () => recomputeOverlays();
        const onScroll = () => recomputeOverlays();
        window.addEventListener('resize', onResize);
        window.addEventListener('scroll', onScroll);
        const wrapper = wrapperRef.current;
        if (wrapper) wrapper.addEventListener('scroll', onScroll);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('scroll', onScroll);
            if (wrapper) wrapper.removeEventListener('scroll', onScroll);
        };
    }, [recomputeOverlays]);

    return (
        <div ref={wrapperRef} style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'auto' }}>
            <div ref={hostRef} style={{
                position: 'relative', zIndex: 1, display: 'block', margin: '0 auto', width: '100vw',
                height: (content ?? null) === null ? 'fit-content' : content.html_height,
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
            }} />
            <div style={{
                position: 'absolute', left: 0, top: 0,
                width: (content ?? null) === null ? '100%' : content.html_width,
                height: (content ?? null) === null ? '100%' : content.html_height,
                zIndex: 2, pointerEvents: 'none'
            }}>
                {overlays.map(item => {
                    const isSelected = answerStore.answers[item.question_id] === item.selection_index;
                    return (
                        <button
                            key={item.id}
                            onClick={(e) => { e.stopPropagation(); answerStore.selectAnswer(item.question_id, item.selection_index); }}
                            title={`Q:${item.question_id} - ${item.selection_index}`}
                            style={{
                                position: 'absolute', left: item.left, top: item.top,
                                width: item.width, height: item.height, borderRadius: 10,
                                border: isSelected ? '2px solid #2563eb' : '2px solid rgba(0,0,0,0.25)',
                                background: isSelected ? 'rgba(37, 99, 235, 0.15)' : 'rgba(255,255,255,0.4)',
                                color: '#111', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                pointerEvents: 'auto', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', userSelect: 'none',
                                padding: '7px'
                            }}
                        >
                            {item.selection_index}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

const SubmitButton = () => {
    const { examId } = useParams();
    const navigate = useNavigate();

    const isSubmitted = useExamStore(state => state.isSubmitted);
    const recordSubmission = useExamStore(state => state.recordSubmission);
    const answerStore = useExamAnswerStore();

    const handleSubmit = async () => {
        if (isSubmitted) return;
        try {
            const payload = answerStore.buildPayload();
            const jwtToken = localStorage.getItem('jwt_token');
            await axios.post(`/sessions/submit/${examId}`, payload, {
                headers: { 'Content-Type': 'application/json', jwt_token: jwtToken },
                withCredentials: true,
            });
            // Record and reset
            answerStore.afterSubmitAndReset();
            alert('Exam submitted successfully!');
            websocketManager.disconnect();
            navigate('/dashboard/examinee');
        } catch (error) {
            console.error('Failed to submit exam:', error);
            alert('There was an error submitting your exam.');
        }
    };

    return (
        <div className="submit-button-container">
            <button onClick={handleSubmit} disabled={isSubmitted}>
                {isSubmitted ? 'Submitted' : 'Submit Answers'}
            </button>
        </div>
    );
};


// --- Main Page Component ---

const ExamPage = () => {
    const { examId } = useParams();
    const [examState, setExamState] = useState('waiting'); // 'waiting' | 'start'
    const [isExamReady, setIsExamReady] = useState(false);
    const [waitingCountdown, setWaitingCountdown] = useState('');
    const [joinInfo, setJoinInfo] = useState(null); // { session_id, user_id, user_name, exam_title, exam_start_datetime }

    const setExamData = useExamStore(state => state.setExamData);
    const getNextSchedule = useExamStore(state => state.getNextSchedule);
    const getCurrentSchedule = useExamStore(state => state.getCurrentSchedule);
    const getExamContentForCurrent = useExamStore(state => state.getExamContentForCurrent);
    const hasNextSchedule = useExamStore(state => state.hasNextSchedule);
    const exam_meta = useExamStore(state => state.exam_meta);
    const videoRef = useRef(null);

    // Pick the target start time for waiting screen
    const targetSchedule = useMemo(() => {
        // If we already have schedules and a next schedule exists, use it
        try {
            const next = getNextSchedule ? getNextSchedule(new Date()) : null;
            if (next) return next;
        } catch (_) {}
        return null;
    }, [getNextSchedule, exam_meta?.exam_start_datetime, hasNextSchedule]);

    const targetStartTime = useMemo(() => {
        if (targetSchedule && targetSchedule.start_datetime) return targetSchedule.start_datetime;
        if (joinInfo?.exam_start_datetime) return new Date(joinInfo.exam_start_datetime);
        if (exam_meta?.exam_start_datetime) return exam_meta.exam_start_datetime;
        return null;
    }, [targetSchedule, joinInfo, exam_meta]);

    // 1. Join session and set up media on initial load
    useEffect(() => {
        const setupConnections = async () => {
            try {
                const existingSessionId = localStorage.getItem('session_id');
                const hasLocalVideo = !!(videoRef.current && videoRef.current.srcObject);
                if (existingSessionId && hasLocalVideo) {
                    console.log('Skipping setupConnections; session/video already present.');
                    return;
                }

                // Step 1: Join the exam session via HTTP
                const jwtToken = localStorage.getItem('jwt_token');
                const joinRes = await axios.get(`/sessions/join_session/${examId}`, {
                    headers: { jwt_token : jwtToken }, withCredentials: true
                });
                const joinData = joinRes?.data || {};
                console.log('Joined exam session:', joinData);
                if (joinData?.session_id) localStorage.setItem('session_id', joinData.session_id);
                setJoinInfo(joinData);

                // Step 3: Connect to media server and publish stream
                await websocketManager.connect(SERVER_URLS.MEDIA_SERVER_URL, "");
                console.log('Media server WebSocket connected.');

                const stream = await websocketManager.startWebcam();
                if (videoRef.current) {
                    videoRef.current.srcObject = stream; // Display local video
                }
                const { audioProducerId, videoProducerId } = await websocketManager.publish(stream);
                console.log('Media stream published successfully.', { audioProducerId, videoProducerId });

                // Step 2: Connect to backend WebSocket
                await websocketManager.connect(SERVER_URLS.BACKEND_SERVER_URL, examId);
                console.log('Backend WebSocket connected.');

                // Setup message listener
                if (websocketManager.backendSocket) {
                    websocketManager.backendSocket.on('message', (data) => {
                        console.log('Received message from backend:', data);
                        alert(`감독관 메시지: ${data.message || JSON.stringify(data)}`);
                    });
                }

            } catch (error) {
                console.error('Failed to setup connections:', error);
                // Handle error, maybe redirect to an error page
            }
        };

        setupConnections();

        // Cleanup function to disconnect when the component unmounts
        return () => {
            websocketManager.disconnect();
        };
    }, [examId]);

    // 2. Fetch exam questions when started
    const startExam = useCallback(async () => {
        try {
            // 1) Determine if we need to fetch exam content
            let needFetch = false;
            try {
                // Throws if content for current schedule is not found
                if (getExamContentForCurrent) getExamContentForCurrent({ now: new Date() });
                else needFetch = true;
            } catch (_) {
                needFetch = true;
            }

            if (needFetch) {
                const jwtToken = localStorage.getItem('jwt_token');
                const res = await axios.get(`/sessions/get_exam_content/${examId}`, {
                    headers: { jwt_token: jwtToken }, withCredentials: true
                });
                setExamData(res.data);
            }

            // 2) Resolve current schedule and its content
            const { schedule, content } = getExamContentForCurrent({ now: new Date() });
            const question_ids = [];
            for (const h of content.htmls || []) {
                for (const q of (h.questions || [])) {
                    if (q?.question_id) question_ids.push(q.question_id);
                }
            }
            const user_id = (joinInfo && joinInfo.user_id) ? joinInfo.user_id : (exam_meta?.user_id || '');
            useExamAnswerStore.getState().initExam({
                user_id,
                schedule_id: schedule.schedule_id,
                exam_content_id: content.exam_content_id,
                question_ids,
            });

            // 3) Switch to exam
            setExamState('start');
        } catch (error) {
            console.error('Failed to fetch exam content or initialize:', error);
        }
    }, [examId, setExamData, getExamContentForCurrent, joinInfo, exam_meta]);


    // 3. Check if it's time to start the exam
    useEffect(() => {
        if (examState !== 'waiting') return;
        const interval = setInterval(() => {
            if (!targetStartTime) return;
            const now = new Date();
            const diff = targetStartTime - now;
            if (diff <= 0) {
                setIsExamReady(true);
                setWaitingCountdown('00:00:00');
                clearInterval(interval);
                return;
            }
            const hours = Math.floor(diff / (1000 * 60 * 60)).toString().padStart(2, '0');
            const minutes = Math.floor((diff / (1000 * 60)) % 60).toString().padStart(2, '0');
            const seconds = Math.floor((diff / 1000) % 60).toString().padStart(2, '0');
            setWaitingCountdown(`${hours}:${minutes}:${seconds}`);
        }, 1000);
        return () => clearInterval(interval);
    }, [examState, targetStartTime]);


    if (examState === 'waiting') {
        const title = joinInfo?.exam_title || exam_meta?.exam_title || 'Exam';
        const userName = joinInfo?.user_name || exam_meta?.user_name || '';
        const scheduleIndex = targetSchedule?.schedule_index || 1;
        return (
            <div className="waiting-room">
                <h1>Exam Waiting Room</h1>
                <div style={{ marginBottom: '12px' }}>
                    <div><strong>Title:</strong> {title}</div>
                    <div><strong>Examinee:</strong> {userName}</div>
                    <div><strong>교시:</strong> {scheduleIndex}교시</div>
                </div>
                <p>Starts in: <span className="countdown">{waitingCountdown || '...'}</span></p>
                <video ref={videoRef} autoPlay muted playsInline style={{ width: '320px', height: '240px', border: '1px solid black' }} />
                <button onClick={startExam} disabled={!isExamReady}>
                    {isExamReady ? 'Start Exam' : 'Waiting for exam to start...'}
                </button>
            </div>
        );
    }

    return (
        <div className="exam-container">
            <Toolbar />
            <div className="main-content">
                {/* Real exam paper rendered via Shadow DOM with overlay selections */}
                <div style={{ flex: 1, minHeight: 0 }}>
                    <ExamPaper />
                </div>
                <div className="sidebar">
                    {/* A small video feed for the user to see themselves */}
                    <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', border: '1px solid #ccc', marginBottom: '10px' }} />
                    {/* Keep legacy answer index space for now; may be empty if using real content */}
                    <AnswerIndexSpace />
                    <SubmitButton />
                </div>
            </div>
        </div>
    );
};

export default ExamPage;
