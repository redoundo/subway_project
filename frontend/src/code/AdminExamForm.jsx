import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import "../css/AdminExamForm.css"
const AdminExamForm = () => {
    const { examId } = useParams();
    const navigate = useNavigate();
    const isEditMode = Boolean(examId);

    // State
    const [examInfo, setExamInfo] = useState({ name: '', startTime: '', endTime: '', duration: '', breakTime: '' });
    const [proctors, setProctors] = useState([{ id: 1, name: '', email: '' }]);
    const [examineesFile, setExamineesFile] = useState(null);
    const [examPeriods, setExamPeriods] = useState([{ id: 1, startTime: '', endTime: '', file: null, existingFile: null }]);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isEditMode) {
            const fetchExamData = async () => {
                setIsLoading(true);
                try {
                    const jwtToken = localStorage.getItem('jwt_token');
                    const response = await axios.get(`/exams/admin/get_exam/${examId}`, {
                        headers: { "jwt_token" : jwtToken}, withCredentials: true
                    });
                    const data = response.data;
                    const schedules = Array.isArray(data.schedules) ? data.schedules : [];
                    const proctors = Array.isArray(data.proctors) ? data.proctors : [];

                    setExamInfo({
                        name: data.exam_title || '',
                        startTime: data.exam_start_datetime ? new Date(data.exam_start_datetime).toISOString().slice(0, 16) : '',
                        endTime: data.exam_end_datetime ? new Date(data.exam_end_datetime).toISOString().slice(0, 16) : '',
                        duration: data.exam_duration_time ?? '',
                        breakTime: data.break_time ?? ''
                    });
                    setProctors(proctors.length ? proctors.map((p, i) => ({ id: i + 1, name: p.name, email: p.email })) : [{ id: 1, name: '', email: '' }]);
                    setExamPeriods(schedules.length ? schedules.map((s, i) => ({
                        id: i + 1,
                        startTime: s.start_datetime ? new Date(s.start_datetime).toISOString().slice(0, 16) : '',
                        endTime: s.end_datetime ? new Date(s.end_datetime).toISOString().slice(0, 16) : '',
                        file: null,
                        existingFile: null
                    })) : [{ id: 1, startTime: '', endTime: '', file: null, existingFile: null }]);
                } catch (err) {
                    console.error('Failed to fetch exam data:', err);
                    setError('Failed to load exam data.');
                } finally {
                    setIsLoading(false);
                }
            };
            fetchExamData();
        }
    }, [examId, isEditMode]);

    // --- Handlers ---
    const handleExamInfoChange = (e) => setExamInfo({ ...examInfo, [e.target.name]: e.target.value });
    const handleProctorChange = (index, e) => {
        const updated = [...proctors];
        updated[index][e.target.name] = e.target.value;
        setProctors(updated);
    };
    const addProctor = () => setProctors([...proctors, { id: Date.now(), name: '', email: '' }]);
    const removeProctor = (index) => setProctors(proctors.filter((_, i) => i !== index));
    const handleExamineesFileChange = (e) => setExamineesFile(e.target.files[0]);
    const handlePeriodChange = (index, e) => {
        const updated = [...examPeriods];
        updated[index][e.target.name] = e.target.value;
        setExamPeriods(updated);
    };
    const handlePeriodFileChange = (index, e) => {
        const updated = [...examPeriods];
        updated[index].file = e.target.files[0];
        setExamPeriods(updated);
    };
    const addPeriod = () => setExamPeriods([...examPeriods, { id: Date.now(), startTime: '', endTime: '', file: null, existingFile: null }]);
    const removePeriod = (index) => setExamPeriods(examPeriods.filter((_, i) => i !== index));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const formData = new FormData();
        formData.append('title', examInfo.name);
        formData.append('start_time', new Date(examInfo.startTime).toISOString());
        formData.append('end_time', new Date(examInfo.endTime).toISOString());
        formData.append('exam_duration_time', String(examInfo.duration ?? ''));
        formData.append('break_time', String(examInfo.breakTime ?? ''));
        if (examineesFile) formData.append('examinee_infos', examineesFile);

        formData.append('supervisor_infos', JSON.stringify(proctors.map(({ name, email }) => ({ name, email }))));

        examPeriods.forEach(period => {
            if (period.file) formData.append('exam_papers', period.file);
        });

        try {
            const jwtToken = localStorage.getItem('jwt_token');
            const config = { headers: { 'Content-Type': 'multipart/form-data', "jwt_token" : jwtToken }, withCredentials: true };
            const url = isEditMode ? `/exams/admin/update_exam/${examId}` : '/exams/admin/create_exams';
            const method = isEditMode ? 'put' : 'post';
            
            await axios[method](url, formData, config);
            
            alert(`Exam successfully ${isEditMode ? 'updated' : 'created'}!`);
            navigate('/admin/dashboard');
        } catch (err) {
            console.error('Failed to save exam:', err);
            setError(err.response?.data?.message || 'An error occurred while saving the exam.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading && isEditMode) return <div>Loading...</div>;

    return (
        <div className="form-container">
            <h1>{isEditMode ? 'Edit Exam' : 'Create New Exam'}</h1>
            <form onSubmit={handleSubmit} className="exam-form">
                {error && <p className="error-message">{error}</p>}
                <fieldset>
                    <legend>Exam Information</legend>
                    <div className="form-group">
                        <label>Exam Title</label>
                        <input type="text" name="name" value={examInfo.name} onChange={handleExamInfoChange} required />
                    </div>
                    <div className="form-group">
                        <label>Start Time</label>
                        <input type="datetime-local" name="startTime" value={examInfo.startTime} onChange={handleExamInfoChange} required />
                    </div>
                    <div className="form-group">
                        <label>End Time</label>
                        <input type="datetime-local" name="endTime" value={examInfo.endTime} onChange={handleExamInfoChange} required />
                    </div>
                    <div className="form-group">
                        <label>Exam Duration (minutes)</label>
                        <input type="number" name="duration" value={examInfo.duration} onChange={handleExamInfoChange} placeholder="e.g., 50" required />
                    </div>
                    <div className="form-group">
                        <label>Break Time (minutes)</label>
                        <input type="number" name="breakTime" value={examInfo.breakTime} onChange={handleExamInfoChange} placeholder="e.g., 10" />
                    </div>
                </fieldset>

                <fieldset>
                    <legend>Proctors</legend>
                    {proctors.map((p, i) => (
                        <div key={p.id} className="dynamic-group">
                            <span>Proctor {i + 1}</span>
                            <input type="text" name="name" placeholder="Name" value={p.name} onChange={(e) => handleProctorChange(i, e)} required />
                            <input type="email" name="email" placeholder="Email" value={p.email} onChange={(e) => handleProctorChange(i, e)} required />
                            {proctors.length > 1 && <button type="button" className="btn-remove" onClick={() => removeProctor(i)}>Remove</button>}
                        </div>
                    ))}
                    <button type="button" className="btn-add" onClick={addProctor}>Add Proctor</button>
                </fieldset>

                <fieldset>
                    <legend>Examinees</legend>
                    <div className="form-group">
                        <label>Examinees List (CSV)</label>
                        <input type="file" accept=".csv" onChange={handleExamineesFileChange} required={!isEditMode} />
                        {isEditMode && <small>Upload a new file only to replace the existing one.</small>}
                    </div>
                </fieldset>

                <fieldset>
                    <legend>Exam Papers (Periods)</legend>
                    {examPeriods.map((p, i) => (
                        <div key={p.id} className="dynamic-group period-group">
                            <span>Period {i + 1}</span>
                            <input type="datetime-local" name="startTime" value={p.startTime} onChange={(e) => handlePeriodChange(i, e)} required />
                            <input type="datetime-local" name="endTime" value={p.endTime} onChange={(e) => handlePeriodChange(i, e)} required />
                            <input type="file" name="file" accept=".pdf" onChange={(e) => handlePeriodFileChange(i, e)} />
                            {p.existingFile && !p.file && <small>Current file: <a href={p.existingFile} target="_blank" rel="noopener noreferrer">View</a></small>}
                            {examPeriods.length > 1 && <button type="button" className="btn-remove" onClick={() => removePeriod(i)}>Remove</button>}
                        </div>
                    ))}
                    <button type="button" className="btn-add" onClick={addPeriod}>Add Period</button>
                </fieldset>

                <div className="form-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => navigate('/admin/dashboard')}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={isLoading}>{isLoading ? 'Saving...' : 'Save Exam'}</button>
                </div>
            </form>
        </div>
    );
};

export default AdminExamForm;
