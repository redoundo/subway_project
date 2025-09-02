/*
# 요청 요약
- 이 파일은 시험지(HTML)를 Shadow DOM으로 렌더링하고, 각 문항 선택지(ExamQuestionSelectionLocation)에 상호작용 버튼을 같은 위치에 오버레이하여 클릭 상태를 질문별로 저장하는 테스트 드라이브 페이지입니다.
- 참고: backend/db/models.py 의 데이터 구조(ExamSession, ExamContent, ExamHTML, ExamQuestion, ExamQuestionSelection, ExamQuestionSelectionLocation)
*/

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';

/**
 * 데이터 모델 참고(요약)
 * ExamSession.contents[0] => {
 *   outer_html: string, // id="page-container" 포함한 외곽 HTML
 *   html_width : float, // 기본 가로 길이인 1095.25
 *   html_height: float, // 기본 세로 높이인 1548.95 * 시험 페이지 수
 *   htmls: [{
 *     page_index: number, // 1-based
 *     html: string,       // id='pf{page_index}' 페이지 div HTML
 *     questions: [{
 *       question_id: string,
 *       question_index: number,
 *       selection: [{
 *         question_id: string,
 *         selection_index: number,
 *         location: { x0, y0, x1, y1 }
 *       }]
 *     }]
 *   }]
 * }
 */

const TEST_DRIVE_PATH = '/on-exams/test_drive/68b65d3e0f3af74afd0502da';

function ExamPageTestDrive() {
  const wrapperRef = useRef(null); // React overlay 기준 컨테이너
  const hostRef = useRef(null);    // Shadow host 컨테이너
  const shadowRef = useRef(null);  // shadowRoot 보관
  const [session, setSession] = useState(null); // ExamSession 전체 응답
  const content = useMemo(() => (session?.contents?.[0] ?? null), [session]);

  // 질문별 선택 상태 저장: { [question_id]: selection_index } (단일 선택 기준)
  const [answers, setAnswers] = useState({});

  const handleSelect = useCallback((questionId, selectionIndex) => {
    setAnswers(prev => ({ ...prev, [questionId]: selectionIndex }));
  }, []);

  // Shadow DOM 초기화 및 시험지 주입
  useEffect(() => {
    if (!content || !hostRef.current) return;

    // 1) Shadow root 준비 (최초 1회)
    if (!shadowRef.current) {
      shadowRef.current = hostRef.current.attachShadow({ mode: 'open' });
    }
    const shadow = shadowRef.current;

    // 2) outer_html 주입
    //    안전을 위해 기존 내용 정리 후 최신 내용으로 교체
    shadow.innerHTML = content.outer_html || '';

    // 3) page-container 안에 각 페이지 HTML 삽입
    const pageContainer = shadow.getElementById('page-container');
    if (pageContainer) {
      pageContainer.style.overflow = "visible";
      pageContainer.style.height = `${Math.ceil(1548.300000 * content.htmls.length) }px`;
      pageContainer.innerHTML = (content.htmls || []).map(h => h.html).join('');
    }
  }, [content]);
  const diff = 1.333321996963399;
  // 오버레이 포지션 정보
  const [overlays, setOverlays] = useState([]);

  const recomputeOverlays = useCallback(() => {
    if (!content || !shadowRef.current || !wrapperRef.current) return;
    const shadow = shadowRef.current;
    const wrapper = wrapperRef.current;
    const wrapperRect = wrapper.getBoundingClientRect();
    const scrollX = wrapper.scrollLeft;
    const scrollY = wrapper.scrollTop;

    const items = [];
    for (const page of content.htmls || []) {
      const pageId = `pf${page.page_index}`;
      const pageEl = shadow.getElementById(pageId);
      if (!pageEl) continue;

      // viewport 기준 좌표를 컨텐츠 기준 좌표로 변환
      const pageRect = pageEl.getBoundingClientRect();
      const baseLeft = pageRect.left - wrapperRect.left + scrollX;
      const baseTop = pageRect.top - wrapperRect.top + scrollY;

      for (const q of page.questions || []) {
        for (const sel of q.selection || []) {
          const { x0, y0, x1, y1 } = sel.location || {};
          if ([x0, y0, x1, y1].some(v => typeof v !== 'number')) continue;

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

  // 사이즈/스크롤 변화에 따른 오버레이 재계산
  useEffect(() => {
    recomputeOverlays();
  }, [recomputeOverlays]);

  useEffect(() => {
    const onResize = () => recomputeOverlays();
    const onScroll = () => recomputeOverlays();

    window.addEventListener('resize', onResize);
    // 윈도우 스크롤(마우스 휠/가운데 버튼 자동 스크롤 포함)에도 반응
    window.addEventListener('scroll', onScroll);
    const wrapper = wrapperRef.current;
    if (wrapper) wrapper.addEventListener('scroll', onScroll);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      if (wrapper) wrapper.removeEventListener('scroll', onScroll);
    };
  }, [recomputeOverlays]);

  // 데이터 가져오기: ExamSession
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await axios.get(TEST_DRIVE_PATH);
        console.log(res.data)
        setSession(res.data);
      } catch (e) {
        console.error('Failed to load test drive session:', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        background: '#f7f7f7',
      }}
    >
      {/* Shadow DOM 실제 시험지 렌더 영역 */}
      <div
        ref={hostRef}
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'block',
          margin: '20px auto',
          width: '100vw',
          height: (content ?? null) === null ? 'fit-content' : content.html_height,
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
        }}
      />

      {/* 오버레이 선택 버튼들 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: (content ?? null) === null ? '100%' : content.html_width,
          height: (content ?? null) === null ? '100%' : content.html_height,
          zIndex: 2,
          pointerEvents: 'none', // 컨테이너는 입력 통과, 버튼만 활성화
        }}
      >
        {overlays.map(item => {
          const isSelected = answers[item.question_id] === item.selection_index;
          return (
            <button
              key={item.id}
              onClick={(e) => { e.stopPropagation(); handleSelect(item.question_id, item.selection_index); }}
              title={`Q:${item.question_id} - ${item.selection_index}`}
              style={{
                position: 'absolute',
                left: item.left,
                top: item.top,
                width: item.width,
                height: item.height,
                borderRadius: 10,
                border: isSelected ? '2px solid #2563eb' : '2px solid rgba(0,0,0,0.25)',
                background: isSelected ? 'rgba(37, 99, 235, 0.15)' : 'rgba(255,255,255,0.4)',
                color: '#111',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                userSelect: 'none',
                backdropFilter: 'blur(2px)',
                padding: "7px",
              }}
            >
              {item.selection_index}
            </button>
          );
        })}
      </div>

      {/* 간단한 상태 요약 */}
      <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 3 }}>
        <pre
          style={{
            margin: 0,
            padding: '8px 10px',
            fontSize: 12,
            background: 'rgba(0,0,0,0.7)',
            color: '#fff',
            borderRadius: 6,
            maxWidth: 360,
            maxHeight: 220,
            overflow: 'auto'
          }}
        >{JSON.stringify(answers, null, 2)}</pre>
      </div>
    </div>
  );
}

export default ExamPageTestDrive;
