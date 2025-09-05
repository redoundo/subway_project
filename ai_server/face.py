import cv2
import mediapipe as mp
import numpy as np
from util import get_canonical_face_model_obj, normalize_vector

# MediaPipe Face Mesh 초기화
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,  # Iris 랜드마크를 얻기 위해 True로 설정
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5)

"""
left_eye pos index : 
159, 158, 157, 173, 160, 161, 246, 33, 7, 163, 144, 145, 153, 154, 155, 133
right eye pos index : 
380, 372, 373, 390, 249, 263, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466 


left iris index : 
470, 471, 468, 469, 472
right iris index : 
475, 473, 476, 474, 477
"""


# 웹캠 열기
cap = cv2.VideoCapture(0)
OBJ_POINTS_3D = get_canonical_face_model_obj()
dist = np.array([[-4.01273947e+00,1.91643263e+01,1.91395148e-02, 3.38945683e-01, -4.49048269e+01]])
camera_matrix = np.array([[741.28103157,0.,258.16642618], [0.,794.16696808,268.50021802], [0.,0.,1.]])

while cap.isOpened():
    success, image = cap.read()
    if not success:
        print("웹캠을 찾을 수 없습니다.")
        continue

    # BGR 이미지를 RGB로 변환
    image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    image_height, image_width, _ = image.shape
    # Face Mesh 처리
    results = face_mesh.process(image)
    # 랜드마크 기본 반환 값(좌표) 접근
    if results.multi_face_landmarks:
        for face_landmarks in results.multi_face_landmarks:
            # face_landmarks.landmark는 478개의 랜드마크 리스트 (refine_landmarks=True일 경우)
            # 각 랜드마크는 x, y, z 좌표를 가짐
            o_left : dict[str ,float] = {"x": 0, "y" : 0, "z" : 0}
            o_right : dict[str ,float] = {"x": 0, "y" : 0, "z" : 0}
            iris_right : dict[str ,float] = {"x": 0, "y" : 0, "z" : 0}
            iris_left : dict[str ,float] = {"x": 0, "y" : 0, "z" : 0}

            # # 예시: 첫 번째 랜드마크의 좌표 출력
            # first_landmark = face_landmarks.landmark[0]
            # print(f'첫 번째 랜드마크 좌표: (x: {first_landmark.x}, y: {first_landmark.y}, z: {first_landmark.z})')

            # 모든 랜드마크를 순회하며 좌표를 사용할 수 있습니다.
            for i, landmark in enumerate(face_landmarks.landmark):
                if i in [159, 158, 157, 173, 160, 161, 246, 33, 7, 163, 144, 145, 153, 154, 155, 133]:
                    o_left["x"] += landmark.x
                    o_left["y"] += landmark.y
                    o_left["z"] += landmark.z
                    print(f"{i} 번째 o_left 값 : {landmark.x}, {landmark.y}, {landmark.y}")
                elif i in [380, 372, 373, 390, 249, 263, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466 ]:
                    o_right["x"] += landmark.x
                    o_right["y"] += landmark.y
                    o_right["z"] += landmark.z
                    print(f"{i} 번째 o_right 값 : {landmark.x}, {landmark.y}, {landmark.y}")
                elif i in [470, 471, 468, 469, 472]:
                    iris_left["x"] += landmark.x
                    iris_left["y"] += landmark.y
                    iris_left["z"] += landmark.z
                    print(f"{i} 번째 iris_left 값 : {landmark.x}, {landmark.y}, {landmark.y}")
                elif i in [475, 473, 476, 474, 477]:
                    iris_right["x"] += landmark.x
                    iris_right["y"] += landmark.y
                    iris_right["z"] += landmark.z
                    print(f"{i} 번째 iris_right 값 : {landmark.x}, {landmark.y}, {landmark.y}")
                else:
                    pass
            eye_direction_local = np.array([
                [iris_left["x"] - o_left["x"],iris_left["y"] - o_left["y"],iris_left["z"] - o_left["z"]],
                [iris_right["x"] - o_right["x"], iris_right["y"] - o_right["y"], iris_right["z"] - o_right["z"]]
            ])
            img_points_2d = []
            for i in range(478):
                lm = face_landmarks.landmark[i]
                x, y = lm.x * image_width, lm.y * image_height
                img_points_2d.append([x, y])
            ok, rvec, tvec = cv2.solvePnP(objectPoints=OBJ_POINTS_3D, imagePoints=np.array(img_points_2d), cameraMatrix=camera_matrix, distCoeffs=dist, flags=cv2.SOLVEPNP_ITERATIVE)
            R, _ = cv2.Rodrigues(rvec)
            g = eye_direction_local @ R
            norm_g = normalize_vector(g)
            print(f"R : {R}")
            print(f"norm_g : {norm_g}")

            print("@@@@" * 7)
            print(f"avg left eye : x = {o_left['x']/16}, y = {o_left['y']/16}, z = {o_left['z']/16}, ")
            print(f"avg right eye : x = {o_right['x']/16}, y = {o_right['y']/16}, z = {o_right['z']/16}, ")
            print(f"avg left iris : x = {iris_left['x']/5}, y = {iris_left['y']/5}, z = {iris_left['z']/5}, ")
            print(f"avg right iris : x = {iris_right['x']/5}, y = {iris_right['y']/5}, z = {iris_right['z']/5}, ")
            print("***" * 7)

    if cv2.waitKey(5) & 0xFF == 27:
        break

cap.release()
face_mesh.close()

"""
camera_matrix = [[741.28103157   0.         258.16642618]
 [  0.         794.16696808 268.50021802]
 [  0.           0.           1.        ]]
초점 거리 (Focal Length): fx=741.28, fy=794.17
주점 (Principal Point): cx=258.17, cy=268.50
[왜곡 계수 (Distortion Coefficients)] : [[-4.01273947e+00  1.91643263e+01  1.91395148e-02  3.38945683e-01 -4.49048269e+01]]
"""
