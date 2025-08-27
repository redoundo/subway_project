import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminLogin, UserLogin } from './code/Login';
import { AdminDashboard, ExamineeDashboard, ProctorDashboard } from './code/Dashboard.jsx';
import AdminExamForm from "./code/AdminExamForm.jsx";
import PreCheckPage from "./code/PreCheckPage.jsx";
import MonitoringDashboard from "./code/MonitoringDashboard.jsx";
import {CookiesProvider} from "react-cookie";


import axios from 'axios';
axios.defaults.baseURL = 'http://localhost:8000/api';

function App() {
  return (
      <CookiesProvider>
    <Routes>
      {/* Redirect root to admin login */}
      <Route path="/" element={<Navigate to="/admin/login" />} />

      {/* Login Routes */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/invite/join_exam/:token" element={<UserLogin />} />

      {/* Dashboard Routes */}
      <Route path="/admin/dashboard" element={<AdminDashboard />} />
      <Route path="/examinee/dashboard" element={<ExamineeDashboard />} />
      <Route path="/proctor/dashboard" element={<ProctorDashboard />} />

      {/* Exam Form Routes */}
      <Route path="/admin/exam/create" element={<AdminExamForm />} />
      <Route path="/admin/exam/edit/:examId" element={<AdminExamForm />} />
      <Route path="/examinee/pre-check/:examId" element={<PreCheckPage />} />

      {/* Other Routes */}
      {/*
      <Route path="/examinee/exam-session/:examId" element={<ExamSession />} />
      */}
      <Route path="/proctor/monitoring/:examId" element={<MonitoringDashboard />} />
    </Routes>
        </CookiesProvider>
  );
}

export default App;

