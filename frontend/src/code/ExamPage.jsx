import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import useExamStore from './store/examStore.js';
import '../css/ExamPage.css';
import websocketManager, { SERVER_URLS } from './WebsocketUtils';


/*
# 요청 :
## 시험 대기 화면을 구현해주세요.

### 시험 대기 화면에 대해서 설명해드리겠습니다.

1. `Examinee` 등록, `session_id` 발급, 벡엔드 서버와 웹 소켓 연결, 미디어 서버와 webrtc 연결을 처리 :
    1)  이 화면에 들어오자마자 프론트엔드 서버는 백엔드 서버에 `GET /api/sessions/join_session/{exam_id}` 요청을 보냅니다.
        - jwt_token 을 header 에 추가하고 withCredential: true 를 추가해 보내야 합니다.
    2)  벡엔드 서버는 이 요청을 받으면 이 응시자를 Examinee 로 등록하고 응답(fastapi.Response)에 `session_id` 라는 이름의 쿠키로 세션 아이디 값을 넣어줍니다.
        -  `Examinee` 로 등록 되어야 감독관이 실제로 시험에 응시한 응시자로 취급되며 감독 대상이 됩니다.
    3)  `session_id` 값을 발급받은 후, 벡엔드 서버에 웹소켓으로 `connect` 요청을 보내서 현재 세션에 참여합니다.
    4)  `mediasoup-client` 라이브러리를 통해 `meidasoup` 라이브러리를 사용하는 미디어 서버에 오디오, 영상 송출 요청을 보냅니다.
    - 이 과정은 응시자가 시험 직전에 응시하더라도 똑같은 과정을 거칩니다.
2. 시험 화면에 입장하는 버튼인 `시험 응시` 버튼이 존재:
    -  `시험 응시` 버튼은 시험 시간이 되자마자 활성화 됩니다. 그 이전엔 비활성화 된 상태라는 거죠.
    -  시험 대기 화면에는 `시험 응시` 버튼 외에도 시험 중 유의해야할 사항에 대한 내용과 시험 시작까지 얼마나 남았는지 보여주는 카운트 다운 컴포넌트가 존재합니다.


## 시험 응시 화면을 구현해주세요.

- `시험 응시` 버튼을 누르면 시험 화면으로 이동합니다.
- 이동과 동시에 백엔드 서버로 `GET /api/on_exams/examinee/get_exam_questions/{exam_id}` 요청을 보냅니다.
- 이 요청은 응시자가 볼 시험 내용과 시험 정보를 반환합니다.
    3) **시험 응시 화면 구성 :**
        - `FRONTEND /examinee/exam/{exam_id}` 경로로 진입했을 때 보여지는 화면입니다.
        1. **툴바(ToolBar) :**
            - 화면의 맨 위에는 css 가 position: fixed 상태인 툴바가 존재합니다.
            - 이 툴바의 왼쪽에는 시험 제목과 몇 교시인지 적혀 있고 오른쪽에는 시험 시작 시간과 시험이 종료될 때까지 얼마나 남았는지 알려주는 숫자가 존재해야 합니다.
        2. **시험 문항 공간(ExamQuestionSpace) :**
            - 툴바 외의 공간 중 80% 차지합니다. 왼쪽 기준입니다.
            - ExamQuestionSpace 는 실제 시험 문항인 여러 개의 ExamQuestion 로 이뤄져있습니다.
            1) **시험 문항(ExamQuestion) :**
                - ExamQuestion 은 이미지로 된 시험 문제(QuestionImage)와 그 시험 문제에 있는 선택지를 선택할 수 있는 버튼(Selections)들로 구성 되어 있습니다.
                - QuestionImage 는 시험 문항의 제목과 보기, 선택지를 전부 가지고 있습니다.
                - 서버에서는 QuestionImage 를 base64 로 인코딩 하여 저장하며 시험 내용을 프론트엔드에 줄 때도 base64 상태로 제공합니다. base64->image 로 바꾸는 작업은 프론트엔드에서 처리합니다.
            2) **문항 선택지(Selections) :**
                - Selections 가 가지는 버튼들의 개수는 딱 정해져 있지 않습니다. 문항마다 다르며 상황에 따라 선택 가능한 정답이 여러 개일 수도 있습니다.
                - Selections 는 이후에 나올 AnswerIndexBox 의 상태가 변경될 때 똑같이 변경 되야 합니다. AnswerIndexBox 또한 Selections 의 정답이나 상태가 바뀌면 똑같이 반영되어야 합니다.
        3. **문항 정답 공간(AnswerIndexSpace) :**
            - 화면의 나머지 15% 공간을 차지하는 컴포넌트입니다.
            - ExamQuestionSpace 가 가지고 있는 ExamQuestion 의 갯수와 똑같은 수의 AnswerIndexBox 로 이뤄져있습니다.
            1) **문항 정답(AnswerIndexBox) :**
                - 문항 번호와 문항의 선택지가 나열 되어 있고 정답으로 고른 인덱스의 버튼만 다른 색으로 칠하는 역할을 맡습니다.
                - 고른 답안을 바꾸려고 할 때 굳이 답을 바꿀 시험 문항을 찾아 스크롤 하지 않고도 바로 답안을 바꿀 수 있게 해주는 편의를 제공합니다.
                - 앞서 말한 것 처럼 Selections 상태와 동기화가 되어야 합니다.
            2) **제출 버튼(SubmitButton) :**
                - 화면의 나머지 5% 를 차지하는 컴포넌트입니다.
                - 서버에 답안 제출 시 `POST /api/session/{exam_id}/submit` 요청을 보냅니다.
                - 응시자가 클릭하거나 시험 시간이 종료되면 비활성화 되는 동시에 지금까지 선택한 답안을 다음과 같이 같이 서버에 전달하는 역할을 합니다.
                   > {exam_content_id: examContent.id , answer : {1 : [0, 3], 2: [1], 3: [2,3]...}}

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
