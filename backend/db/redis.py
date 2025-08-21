import redis, os
from dotenv import load_dotenv

load_dotenv()

redis_host: str = os.getenv("REDIS_HOST")
redis_port: str = os.getenv("REDIS_PORT")
redis_pwd: str = os.getenv("REDIS_PWD")
redis_user_name: str = os.getenv("REDIS_USER_NAME")

redis_connection = redis.Redis(
    host=redis_host,
    port=int(redis_port),
    decode_responses=True,
    username=redis_user_name,
    password=redis_pwd,
)

success = redis_connection.set('foo', 'bar')
# True

result = redis_connection.get('foo')
print(result)
# >>> bar

