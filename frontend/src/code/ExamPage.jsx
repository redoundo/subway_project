import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import useExamStore from './store/examStore.js';
import '../css/ExamPage.css';
import websocketManager, { SERVER_URLS } from './WebsocketUtils';

/*
# 요청 :
## frontend/src/code/ExamPageTestDrive.jsx 파일을 참고하여 응시자가 시험을 보는 화면을 구현해주세요.

frontend/src/code/ExamPageTestDrive.jsx 는 정중앙에 렌더링 되는 시험 문제를 구현하는 코드입니다.
frontend/src/code/ExamPageTestDrive.jsx 파일에 있는 코드를 이 파일로 옮겨 화면 정중앙에 위치하게 만들어주세요.

그리고 추가적으로 다음과 같은 컴포넌트가 필요합니다 :
1. ToolBar :
    - 시험 제목, 현재 몇 교시인지, 시험 종료시간까지 얼마나 남았는지 보여줍니다.
    - 화면의 맨 위에 붙어 있으며 스크롤을 하더라도 따라다닙니다.
2. AnswerSpace :
    - 응시자가 선택한 답을 표시하는 길쭉한 직사각형 컴포넌트입니다. 화면의 맨 오른쪽에 있습니다.
    - 스크롤 하더라도 동일한 위치에 있습니다. 문항, 선택지 버튼들이 가로로 나열 되어 있습니다.
    - 응시자가 특정 문항의 답안을 해당 문항으로 직접 이동하지 않아도 답안을 바꿀 수 있는 편의성을 제공합니다.
        - 하지만 이 말은 AnswerSpace 를 통해 응시자가 고른 선택지가 실제 문항에서도 선택된 상태여야 한다는 걸 의미합니다. 그렇지 않으면 응시자는 혼란에 빠질테니까요.
        - 즉, 변경 사항이 동기화 되어야 한다는 거죠.
        - 이 부분은 frontend/src/code/store/examStore.js 을 참고하시면서 구현하시면 됩니다.
    - frontend/src/code/ExamPageTestDrive.jsx 파일의 42 ~ 46 번째 줄과  224 ~ 238 번째 줄들에 있는 코드가 동기화 기능 없이 아주 간단하게 구현된 AnswerSpace 입니다.
3. SubmitButton:
    - 답안을 제출하는 버튼입니다. AnswerSpace 의 하단에 위치하며 AnswerSpace 와 똑같이 스크롤을 해도 움직이지 않습니다.
    - 답안을 제출하는 ENDPOINT : `POST /api/sessions/submit/{exam_id}`
    - 답안 제출을 정상적으로 하려면 다음의 값들이 필요합니다.
        - session_id, jwt_token 는 post 요청의 헤더에 반드시 추가되어야 합니다.
        - 각 문항의 답안은 {"question_id": 문항_id, "answer_index" : 선택한 선택지의 인덱스 값} 으로 구성되어야 합니다.
        - schedule_id, exam_content_id 도 같이 data 에 넣어 보내야 합니다.
        - backend/db/models.py 의 128~147 번째 줄을 확인해주세요. 해당 코드들이 db 모델이 벡엔드 서버가 최종적으로 예상하는 형태입니다.
    - 시험 종료 전에 응시자가 이 버튼을 누르면 정말로 제출하시겠습니까? 라는 alert 를 발생시킵니다.
        - 이 alert 의 응답이 '예' 라면, 응시자가 고른 답변들을 `POST /api/sessions/submit/{exam_id}` 로 보냅니다.
        - 응답이 "아니오" 라면, 아무것도 하지 않습니다.
    - 이 버튼은 시험 종료 시간이 되자 마자 비활성화 되며 응시자가 선택한 답변들을 `POST /api/sessions/submit/{exam_id}` 로 보낸 뒤 응시자를 바로 /examinee/dashboard 로 이동시키거나 examState 로 화면을 조절합니다.
        - 추가 스케줄이 있는 경우, examState 를 `waiting` 으로 바꿉니다. examState 값이 waiting 으로 바뀌면 시험 화면이 시험 대기 화면으로 바뀌어야 합니다.
        - 없는 경우 바로 /examinee/dashboard 로 이동합니다.
 */

// Mock API data for testing
const MOCK_EXAM_DATA = {
    title: "Sample Online Exam",
    period: "1교시",
    startTime: new Date(Date.now() + 5000).toISOString(), // Starts in 5 seconds for testing
    endTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes from now
    questions: [
        {
            id: 'q1',
            title: 'Question 1',
            image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', // 1x1 black pixel
            options: ['A', 'B', 'C', 'D'],
            multiSelect: false,
        },
        {
            id: 'q2',
            title: 'Question 2',
            image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
            options: ['Option 1', 'Option 2', 'Option 3'],
            multiSelect: true,
        }
    ]
};


// --- Sub-components ---

const Toolbar = () => {
    const { title, period, startTime, endTime } = useExamStore(state => state.examDetails);
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        if (!endTime) return;

        const interval = setInterval(() => {
            const now = new Date();
            const end = new Date(endTime);
            const diff = end - now;

            if (diff <= 0) {
                setTimeLeft('00:00:00');
                // Add logic to auto-submit exam
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

const SubmitButton = () => {
    const { examId } = useParams();
    const { answers, isSubmitted, submitExam } = useExamStore();
    const navigate = useNavigate();

    const handleSubmit = async () => {
        if (isSubmitted) return;

        const formattedAnswers = {
            // This structure might need adjustment based on the exact backend requirement
            // e.g., exam_content_id might be a single ID for the whole test
            answer: Object.entries(answers).reduce((acc, [questionId, answerIndices]) => {
                // Assuming question IDs are like "q1", "q2" and we need to send "1", "2"
                const questionNum = questionId.replace('q', '');
                acc[questionNum] = answerIndices;
                return acc;
            }, {})
        };

        try {
            // await axios.post(`/api/session/${examId}/submit`, formattedAnswers);
            console.log("Submitting:", formattedAnswers);
            submitExam();
            alert("Exam submitted successfully!");
            websocketManager.disconnect();
            navigate('/dashboard/examinee');
        } catch (error) {
            console.error("Failed to submit exam:", error);
            alert("There was an error submitting your exam.");
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
    const [examState, setExamState] = useState('waiting'); // waiting, started, finished
    const [isExamReady, setIsExamReady] = useState(false);
    const setExamData = useExamStore(state => state.setExamData);
    const videoRef = useRef(null);

    // 1. Join session and set up media on initial load
    useEffect(() => {
        const setupConnections = async () => {
            try {

                // Step 1: Join the exam session via HTTP
                const jwtToken = localStorage.getItem('jwt_token');
                await axios.get(`/session/join_session/${examId}`, {
                    headers: { jwt_token : jwtToken }, withCredentials: true
                });
                console.log("Successfully joined exam session.");

                // Step 3: Connect to media server and publish stream
                await websocketManager.connect(SERVER_URLS.MEDIA_SERVER_URL);
                console.log("Media server WebSocket connected.");

                const stream = await websocketManager.startWebcam();
                if (videoRef.current) {
                    videoRef.current.srcObject = stream; // Display local video
                }
                const { audioProducerId, videoProducerId } = await websocketManager.publish(stream);
                console.log("Media stream published successfully.", { audioProducerId, videoProducerId });

                // Step 2: Connect to backend WebSocket
                await websocketManager.connect(SERVER_URLS.BACKEND_SERVER_URL);
                console.log("Backend WebSocket connected.");

                // Setup message listener
                websocketManager.backendSocket.on('message', (data) => {
                    console.log('Received message from backend:', data);
                    alert(`감독관 메시지: ${data.message || JSON.stringify(data)}`);
                });


            } catch (error) {
                console.error("Failed to setup connections:", error);
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
            // const token = localStorage.getItem('token');
            // const response = await axios.get(`/session/examinee/get_exam_questions/${examId}`, {
            //     headers: { Authorization: `Bearer ${token}` }
            // });
            // setExamData(response.data);
            setExamData(MOCK_EXAM_DATA); // Using mock data for now
            setExamState('started');
        } catch (error) {
            console.error("Failed to fetch exam questions:", error);
            // Handle error
        }
    }, [examId, setExamData]);


    // 3. Check if it's time to start the exam
    useEffect(() => {
        if (examState === 'waiting') {
            const interval = setInterval(() => {
                // This logic should be driven by server time, but using client time for mock
                const now = new Date();
                const startTime = new Date(MOCK_EXAM_DATA.startTime);
                if (now >= startTime) {
                    setIsExamReady(true);
                    clearInterval(interval);
                }
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [examState]);


    if (examState === 'waiting') {
        return (
            <div className="waiting-room">
                <h1>Exam Waiting Room</h1>
                <p>The exam will be available to start at the designated time.</p>
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
                <ExamQuestionSpace />
                <div className="sidebar">
                    {/* A small video feed for the user to see themselves */}
                    <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', border: '1px solid #ccc', marginBottom: '10px' }} />
                    <AnswerIndexSpace />
                    <SubmitButton />
                </div>
            </div>
        </div>
    );
};

export default ExamPage;
