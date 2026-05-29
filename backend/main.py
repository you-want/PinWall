from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os
import uuid
import bcrypt

load_dotenv()

app = Flask(__name__)

# 配置
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///./pinwall.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv('SECRET_KEY', 'secret-key')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(minutes=int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', 10080)))

db = SQLAlchemy(app)
jwt = JWTManager(app)
CORS(app, resources={r"/*": {"origins": "*"}})

# 错误码定义
class ErrorCode:
    SUCCESS = 0
    BAD_REQUEST = 400
    UNAUTHORIZED = 401
    FORBIDDEN = 403
    NOT_FOUND = 404
    INTERNAL_ERROR = 500
    
    # 业务错误码
    EMAIL_ALREADY_REGISTERED = 1001
    INCORRECT_EMAIL_OR_PASSWORD = 1002
    NOTE_NOT_FOUND = 1003
    VALIDATION_ERROR = 1004

# 统一响应函数
def success_response(data=None, message="成功"):
    return jsonify({
        "code": ErrorCode.SUCCESS,
        "message": message,
        "data": data or {}
    })

def error_response(code, message, data=None):
    return jsonify({
        "code": code,
        "message": message,
        "data": data or {}
    }), 400 if code < 500 else 500

# 模型
class User(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String(120), unique=True, nullable=False)
    hashed_password = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Note(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), nullable=False)
    content = db.Column(db.Text, nullable=False)
    is_checked = db.Column(db.Boolean, default=False)
    color = db.Column(db.String(20), default='#FFF9C4')
    position_x = db.Column(db.Float, default=0.0)
    position_y = db.Column(db.Float, default=0.0)
    angle = db.Column(db.Float, default=0.0)
    share_token = db.Column(db.String(36))
    is_public = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)

# 创建数据库表
with app.app_context():
    db.create_all()

# 路由
@app.route('/')
def index():
    return success_response({"message": "Welcome to PinWall API"})

# 认证路由
@app.route('/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return error_response(ErrorCode.VALIDATION_ERROR, "邮箱和密码不能为空")

    if User.query.filter_by(email=email).first():
        return error_response(ErrorCode.EMAIL_ALREADY_REGISTERED, "该邮箱已被注册")

    # 限制密码长度
    if len(password) > 72:
        password = password[:72]
    
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    new_user = User(email=email, hashed_password=hashed_password.decode('utf-8'))
    db.session.add(new_user)
    db.session.commit()

    return success_response({
        "user": {
            "id": new_user.id,
            "email": new_user.email,
            "created_at": new_user.created_at.isoformat()
        }
    }, "注册成功")

@app.route('/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('username') or data.get('email')
    password = data.get('password')

    if not email or not password:
        return error_response(ErrorCode.VALIDATION_ERROR, "邮箱和密码不能为空")

    user = User.query.filter_by(email=email).first()

    if not user:
        return error_response(ErrorCode.INCORRECT_EMAIL_OR_PASSWORD, "邮箱或密码错误")
    
    # 限制密码长度
    if len(password) > 72:
        password = password[:72]

    if not bcrypt.checkpw(password.encode('utf-8'), user.hashed_password.encode('utf-8')):
        return error_response(ErrorCode.INCORRECT_EMAIL_OR_PASSWORD, "邮箱或密码错误")

    access_token = create_access_token(identity=user.id)
    return success_response({
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "created_at": user.created_at.isoformat()
        }
    }, "登录成功")

# 便签路由
@app.route('/notes', methods=['GET'])
@jwt_required()
def get_notes():
    user_id = get_jwt_identity()
    notes = Note.query.filter_by(user_id=user_id).all()
    return success_response({
        "notes": [note_to_dict(n) for n in notes]
    })

@app.route('/notes', methods=['POST'])
@jwt_required()
def create_note():
    user_id = get_jwt_identity()
    data = request.get_json()
    content = data.get('content')
    
    if not content:
        return error_response(ErrorCode.VALIDATION_ERROR, "便签内容不能为空")
    
    color = data.get('color', '#FFF9C4')
    position_x = data.get('position_x', 0.0)
    position_y = data.get('position_y', 0.0)
    angle = data.get('angle', 0.0)

    new_note = Note(
        user_id=user_id,
        content=content,
        color=color,
        position_x=position_x,
        position_y=position_y,
        angle=angle
    )
    db.session.add(new_note)
    db.session.commit()

    return success_response({
        "note": note_to_dict(new_note)
    }, "便签创建成功")

@app.route('/notes/<note_id>', methods=['GET'])
@jwt_required()
def get_note(note_id):
    user_id = get_jwt_identity()
    note = Note.query.filter_by(id=note_id, user_id=user_id).first()
    
    if not note:
        return error_response(ErrorCode.NOTE_NOT_FOUND, "便签不存在")

    return success_response({
        "note": note_to_dict(note)
    })

@app.route('/notes/<note_id>', methods=['PUT'])
@jwt_required()
def update_note(note_id):
    user_id = get_jwt_identity()
    note = Note.query.filter_by(id=note_id, user_id=user_id).first()
    
    if not note:
        return error_response(ErrorCode.NOTE_NOT_FOUND, "便签不存在")

    data = request.get_json()
    if 'content' in data:
        note.content = data['content']
    if 'is_checked' in data:
        note.is_checked = data['is_checked']
    if 'color' in data:
        note.color = data['color']
    if 'position_x' in data:
        note.position_x = data['position_x']
    if 'position_y' in data:
        note.position_y = data['position_y']
    if 'angle' in data:
        note.angle = data['angle']
    note.updated_at = datetime.utcnow()

    db.session.commit()
    return success_response({
        "note": note_to_dict(note)
    }, "便签更新成功")

@app.route('/notes/<note_id>', methods=['DELETE'])
@jwt_required()
def delete_note(note_id):
    user_id = get_jwt_identity()
    note = Note.query.filter_by(id=note_id, user_id=user_id).first()
    
    if not note:
        return error_response(ErrorCode.NOTE_NOT_FOUND, "便签不存在")

    db.session.delete(note)
    db.session.commit()
    return success_response({}, "便签删除成功")

@app.route('/notes/<note_id>/share', methods=['POST'])
@jwt_required()
def toggle_share(note_id):
    user_id = get_jwt_identity()
    note = Note.query.filter_by(id=note_id, user_id=user_id).first()
    
    if not note:
        return error_response(ErrorCode.NOTE_NOT_FOUND, "便签不存在")

    note.is_public = not note.is_public
    if note.is_public and not note.share_token:
        note.share_token = str(uuid.uuid4())
    note.updated_at = datetime.utcnow()

    db.session.commit()
    return success_response({
        "note": note_to_dict(note)
    }, "分享状态已更新")

@app.route('/notes/share/<share_token>', methods=['GET'])
def get_public_note(share_token):
    note = Note.query.filter_by(share_token=share_token, is_public=True).first()
    
    if not note:
        return error_response(ErrorCode.NOTE_NOT_FOUND, "便签不存在或未公开")

    return success_response({
        "note": note_to_dict(note)
    })

# 辅助函数
def note_to_dict(note):
    return {
        "id": note.id,
        "user_id": note.user_id,
        "content": note.content,
        "is_checked": note.is_checked,
        "color": note.color,
        "position_x": note.position_x,
        "position_y": note.position_y,
        "angle": note.angle,
        "share_token": note.share_token,
        "is_public": note.is_public,
        "created_at": note.created_at.isoformat(),
        "updated_at": note.updated_at.isoformat()
    }

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8000)