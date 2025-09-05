import requests
import numpy as np


def get_canonical_face_model_obj():
    """MediaPipe의 정규 3D 얼굴 모델 obj 파일을 다운로드하고 파싱합니다."""
    # face_model_with_iris.obj 파일의 URL
    url = "https://raw.githubusercontent.com/google-ai-edge/mediapipe/refs/heads/master/mediapipe/modules/face_geometry/data/face_model_with_iris.obj"

    try:
        response = requests.get(url)
        response.raise_for_status()  # HTTP 오류가 발생하면 예외를 발생시킵니다.
    except requests.exceptions.RequestException as e:
        print(f"Error downloading the obj file: {e}")
        return None

    # 정점(vertex) 데이터만 파싱합니다.
    lines = response.text.splitlines()
    vertices = []
    for line in lines:
        if line.startswith('v '):
            parts = line.split(' ')
            # 'v'를 제외하고 float으로 변환하여 추가합니다.
            vertices.append([float(p) for p in parts[1:] if p])

    return np.array(vertices, dtype=np.float32)


def normalize_vector(v):
    norm = np.linalg.norm(v)
    if norm == 0:  # 0 벡터인 경우 0으로 반환
        return v
    return v / norm