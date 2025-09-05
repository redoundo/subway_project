import requests
import cv2
import mediapipe as mp
import numpy as np
from util import get_canonical_face_model_obj


# # objpoints로 사용할 3D 모델 좌표를 로드합니다.
# # 이 모델은 모든 프레임에서 동일하게 사용됩니다.
# canonical_face_model = get_canonical_face_model_obj()
# if canonical_face_model is not None:
#     # MediaPipe Face Mesh는 468개의 랜드마크를 사용하므로, obj 파일의 정점 수와 일치하는지 확인합니다.
#     # 만약 다르다면, Face Mesh가 사용하는 특정 랜드마크 인덱스에 맞춰 필터링해야 할 수 있습니다.
#     # 일반적으로 obj 파일의 정점 순서가 랜드마크 인덱스와 일치합니다.
#     OBJ_POINTS_3D = canonical_face_model[:468]

# MediaPipe Face Mesh 초기화
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5)

# 캘리브레이션을 위한 데이터 저장 리스트
objpoints_list = []  # 3D 점 (실제 세계)
imgpoints_list = []  # 2D 점 (이미지 평면)

# 웹캠 열기
cap = cv2.VideoCapture(0)

# 정규 3D 얼굴 모델 로드
OBJ_POINTS_3D = get_canonical_face_model_obj()
if OBJ_POINTS_3D is None:
    print("정규 얼굴 모델을 로드할 수 없습니다. 프로그램을 종료합니다.")
    exit()
print(OBJ_POINTS_3D)
print("얼굴을 천천히 여러 각도로 움직여주세요.")
print("'c' 키를 누를 때마다 현재 프레임의 랜드마크가 캘리브레이션에 사용됩니다.")
print("데이터가 15개 이상 모이면 'q' 키를 눌러 캘리브레이션을 시작하고 종료합니다.")

while cap.isOpened():
    success, image = cap.read()
    if not success:
        continue

    # 성능 향상을 위해 이미지를 읽기 전용으로 만듭니다.
    image.flags.writeable = False
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(image_rgb)
    image.flags.writeable = True

    image_height, image_width, _ = image.shape

    if results.multi_face_landmarks:
        face_landmarks = results.multi_face_landmarks[0]

        # 현재 프레임의 2D 랜드마크 좌표를 저장할 리스트
        img_points_2d = []
        for i in range(478):
            lm = face_landmarks.landmark[i]
            x, y = lm.x * image_width, lm.y * image_height
            img_points_2d.append([x, y])

            # 이미지에 랜드마크 그리기 (시각화용)
            cv2.circle(image, (int(x), int(y)), 1, (0, 255, 0), -1)

        img_points_2d = np.array(img_points_2d, dtype=np.float32)

        key = cv2.waitKey(5) & 0xFF
        if key == ord('c'):
            # 'c'를 누르면 현재 랜드마크를 데이터셋에 추가
            objpoints_list.append(OBJ_POINTS_3D)
            imgpoints_list.append(img_points_2d)
            print(f"데이터 수집 완료: {len(objpoints_list)}개")

        elif key == ord('q'):
            # 'q'를 누르면 종료
            break

    # 화면에 현재 수집된 데이터 개수 표시
    cv2.putText(image, f"Collected: {len(objpoints_list)}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
    cv2.imshow('MediaPipe Face Mesh', image)

cap.release()
cv2.destroyAllWindows()

# --- 카메라 캘리브레이션 실행 ---
if len(objpoints_list) > 10:  # 최소 10개 이상의 데이터가 있을 때 실행
    print("\n카메라 캘리브레이션을 시작합니다...")

    # gray.shape[::-1] 대신 이미지 크기를 직접 사용
    image_size = (image_width, image_height)

    # 초기 내부 파라미터 행렬 생성
    initial_camera_matrix = np.array([[image_size[0], 0, image_size[0] / 2],
                                      [0, image_size[0], image_size[1] / 2],
                                      [0, 0, 1]], dtype=np.float64)
    print(initial_camera_matrix)
    ret, camera_matrix, dist_coeffs, rvecs, tvecs = cv2.calibrateCamera(
        objpoints_list, imgpoints_list, image_size, initial_camera_matrix, None, flags=cv2.CALIB_USE_INTRINSIC_GUESS)

    if ret:
        print("\n캘리브레이션 성공!")
        print("\n[카메라 매트릭스]")
        print(camera_matrix)

        fx = camera_matrix[0, 0]
        fy = camera_matrix[1, 1]
        cx = camera_matrix[0, 2]
        cy = camera_matrix[1, 2]

        print(f"\n초점 거리 (Focal Length): fx={fx:.2f}, fy={fy:.2f}")
        print(f"주점 (Principal Point): cx={cx:.2f}, cy={cy:.2f}")

        print("\n[왜곡 계수 (Distortion Coefficients)]")
        print(dist_coeffs)
        print("\n[rvecs]")
        print(rvecs)
        print("\n[tvecs]")
        print(tvecs)
    else:
        print("\n캘리브레이션 실패.")
else:
    print("\n수집된 데이터가 부족하여 캘리브레이션을 진행할 수 없습니다.")