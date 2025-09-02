import React, { useRef, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import useStatusStore from './store/statusStore.js'; // Import the Zustand store
import '../css/PreCheckPage.css';


const PreCheckPage = () => {
    const { examId_ } = useParams();
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    // Zustand store for state management
    const {
        micStatus, setMicStatus,
        webcamStatus, setWebcamStatus,
        identityStatus, setIdentityStatus,
        preCheckComplete, setPreCheckComplete
    } = useStatusStore();


    const [stream, setStream] = useState(null);
    const [error, setError] = useState('');
    const [verificationAttempts, setVerificationAttempts] = useState(0);

    // Cleanup stream on component unmount
    useEffect(() => {
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [stream]);

    // Auto-reconnect streams when entering the page if previous checks were successful
    useEffect(() => {
        const reconnectIfNeeded = async () => {
            try {
                // Prefer full media stream if webcam check previously succeeded
                if (!stream && webcamStatus === 'success') {
                    const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                    setStream(mediaStream);
                    if (videoRef.current) {
                        videoRef.current.srcObject = mediaStream;
                    }
                    return;
                }
                // Otherwise, reconnect audio-only if mic check previously succeeded
                if (!stream && micStatus === 'success') {
                    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    setStream(audioStream);
                }
            } catch (err) {
                console.error('Auto-reconnect for pre-check media failed:', err);
                // Do not alter existing statuses; just surface an informational error
                setError('Could not automatically reconnect media devices.');
            }
        };

        reconnectIfNeeded();
        // Only attempt when statuses change and no stream is active
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [webcamStatus, micStatus]);


    const handleMicCheck = async () => {
        setMicStatus('checking');
        setError('');
        try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioStream.getTracks().forEach(track => track.stop());
            setMicStatus('success');
        } catch (err) {
            console.error('Microphone check failed:', err);
            setError('Microphone not found or access was denied. You will be redirected.');
            setMicStatus('error');
            setTimeout(() => navigate('/dashboard/examinee'), 3000);
        }
    };

    const handleWebcamCheck = async () => {
        if (micStatus !== 'success') return;
        setWebcamStatus('checking');
        setError('');
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
            setWebcamStatus('success'); 
        } catch (err) {
            console.error('Webcam check failed:', err);
            setError('Webcam not found or access was denied. You will be redirected.');
            setWebcamStatus('error');
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            setTimeout(() => navigate('/dashboard/examinee'), 3000);
        }
    };

    const handleIdentityVerification = async () => {
        if (webcamStatus !== 'success') return;

        setIdentityStatus('checking');
        setError('');

        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            // 신분증을 얼굴 옆에 둔 상태에서 checking 버튼을 누르면 스크린 샷을 그립니다.
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(async (blob) => {
                const formData = new FormData();
                formData.append('image', blob, 'identity.jpg');

                try {
                    // TODO : jwt_token 는 localStorage 가 아니라 cookie 에 들어가야 합니다. react-cookie 를 사용해야 하는데...
                    const jwtToken = localStorage.getItem('jwt_token');
                    const res = await axios.post('/pre-checks/identity-verification', formData, {
                        headers: {
                            'Content-Type': 'multipart/form-data',
                            jwt_token: jwtToken
                        }, withCredentials: true
                    });
                    console.log(res.data.result);
                    setIdentityStatus('success');
                    setPreCheckComplete(res.data.result);
                    if (stream) {
                        stream.getTracks().forEach(track => track.stop());
                    }
                } catch (err) {
                    console.error('Identity verification failed:', err);
                    const newAttempts = verificationAttempts + 1;
                    setVerificationAttempts(newAttempts);

                    if (newAttempts >= 5) {
                        setError('Identity verification failed 5 times. Redirecting to login.');
                        setIdentityStatus('error');
                        // TODO : jwt_token, token 전부 localStorage 가 아니라 cookie 에 들어가야 합니다. react-cookie 를 사용해야 하는데...
                        localStorage.removeItem('jwt_token');
                        const tok = localStorage.getItem("token");
                        // 5 번 이상 실패하면 jwt_token 을 지우고 맨 처음 로그인 했던 화면으로 이동합니다.
                        setTimeout(() => navigate(`/invite/join_exam/${tok}`), 3000);
                    } else {
                        setError(`Verification failed. Please try again. (Attempt ${newAttempts}/5)`);
                        setIdentityStatus('retrying');
                    }
                }
            }, 'image/jpeg');
        }
    };

    const handleReturnToDashboard = () => {
        navigate('/dashboard/examinee');
    };

    return (
        <div className="pre-check-container">
            <h2>Pre-Exam Environment Check</h2>
            {error && <p className="error-message">{error}</p>}

            <div className="media-check">
                <video ref={videoRef} autoPlay playsInline muted className={webcamStatus === 'success' ? 'visible' : 'hidden'}></video>
                <canvas ref={canvasRef} className="hidden"></canvas>
                {webcamStatus !== 'success' && <div className="placeholder-box">Your webcam feed will appear here.</div>}
            </div>

            <div className="steps-container">
                <div className="step">
                    <h3>Step 1: Microphone Check</h3>
                    <p>Status: {micStatus}</p>
                    <button onClick={handleMicCheck} disabled={micStatus !== 'idle'}>
                        Check Microphone
                    </button>
                </div>

                <div className="step">
                    <h3>Step 2: Webcam Check</h3>
                    <p>Status: {webcamStatus}</p>
                    <button onClick={handleWebcamCheck} disabled={micStatus !== 'success' || webcamStatus !== 'idle'}>
                        Check Webcam
                    </button>
                </div>

                <div className="step">
                    <h3>Step 3: Identity Verification</h3>
                    <p>Status: {identityStatus}</p>
                    <p>Please hold your ID card next to your face and click the button.</p>
                    <button
                        onClick={handleIdentityVerification}
                        disabled={webcamStatus !== 'success' || identityStatus === 'checking' || identityStatus === 'success'}
                    >
                        {identityStatus === 'checking' ? 'Verifying...' : 'Verify Identity'}
                    </button>
                </div>
            </div>

            {preCheckComplete && (
                <div className="completion-section">
                    <h3>Pre-check Complete!</h3>
                    <p>You have successfully completed all pre-exam checks.</p>
                    <button onClick={handleReturnToDashboard} className="btn btn-primary">
                        Return to Dashboard
                    </button>
                </div>
            )}
        </div>
    );
};

export default PreCheckPage;
