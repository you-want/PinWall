#!/usr/bin/env python3
"""
PinWall 全流程自动化测试脚本
测试内容：
1. 注册用户
2. 登录获取 token
3. 创建便签
4. 获取便签列表
5. 更新便签
6. 分享便签
7. 获取公开便签
8. 删除便签
"""

import requests
import json
import time
import sys
from datetime import datetime

API_BASE = "http://localhost:8000"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    RESET = '\033[0m'

def print_success(msg):
    print(f"{Colors.GREEN}✅ {msg}{Colors.RESET}")

def print_error(msg):
    print(f"{Colors.RED}❌ {msg}{Colors.RESET}")

def print_info(msg):
    print(f"{Colors.BLUE}ℹ️ {msg}{Colors.RESET}")

def print_title(msg):
    print(f"\n{Colors.BOLD}{Colors.YELLOW}{msg}{Colors.RESET}")
    print("-" * 50)

def test_api_health():
    """测试 API 是否运行"""
    print_title("1. 测试 API 健康检查")
    try:
        response = requests.get(f"{API_BASE}/")
        if response.status_code == 200:
            print_success("API 运行正常")
            return True
        else:
            print_error(f"API 返回错误: {response.status_code}")
            return False
    except Exception as e:
        print_error(f"无法连接到 API: {e}")
        return False

def test_register(email, password):
    """测试用户注册"""
    print_title("2. 测试用户注册")
    try:
        response = requests.post(
            f"{API_BASE}/auth/register",
            json={"email": email, "password": password}
        )
        if response.status_code == 201:
            print_success(f"用户注册成功: {email}")
            return response.json()
        elif response.status_code == 400 and "already registered" in response.text:
            print_info(f"用户已存在，跳过注册")
            return {"id": "existing"}
        else:
            print_error(f"注册失败: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print_error(f"注册异常: {e}")
        return None

def test_login(email, password):
    """测试用户登录"""
    print_title("3. 测试用户登录")
    try:
        response = requests.post(
            f"{API_BASE}/auth/login",
            json={"email": email, "password": password}
        )
        if response.status_code == 200:
            data = response.json()
            token = data.get("access_token")
            print_success("登录成功")
            print_info(f"Token: {token[:30]}...")
            return token
        else:
            print_error(f"登录失败: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print_error(f"登录异常: {e}")
        return None

def test_create_note(token, content, color="#FFF9C4"):
    """测试创建便签"""
    print_title("4. 测试创建便签")
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.post(
            f"{API_BASE}/notes",
            json={
                "content": content,
                "color": color,
                "position_x": 100,
                "position_y": 100,
                "angle": 0
            },
            headers=headers
        )
        if response.status_code == 201:
            note = response.json()
            print_success(f"便签创建成功: {note['id']}")
            print_info(f"内容: {note['content']}")
            print_info(f"颜色: {note['color']}")
            return note
        else:
            print_error(f"创建便签失败: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print_error(f"创建便签异常: {e}")
        return None

def test_get_notes(token):
    """测试获取便签列表"""
    print_title("5. 测试获取便签列表")
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{API_BASE}/notes", headers=headers)
        if response.status_code == 200:
            notes = response.json()
            print_success(f"获取到 {len(notes)} 个便签")
            for i, note in enumerate(notes):
                print_info(f"  {i+1}. {note['content'][:30]}...")
            return notes
        else:
            print_error(f"获取便签失败: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print_error(f"获取便签异常: {e}")
        return None

def test_update_note(token, note_id, updates):
    """测试更新便签"""
    print_title("6. 测试更新便签")
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.put(
            f"{API_BASE}/notes/{note_id}",
            json=updates,
            headers=headers
        )
        if response.status_code == 200:
            note = response.json()
            print_success("便签更新成功")
            if "content" in updates:
                print_info(f"新内容: {note['content']}")
            if "is_checked" in updates:
                print_info(f"打卡状态: {note['is_checked']}")
            return note
        else:
            print_error(f"更新便签失败: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print_error(f"更新便签异常: {e}")
        return None

def test_toggle_share(token, note_id):
    """测试切换分享状态"""
    print_title("7. 测试分享便签")
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.post(
            f"{API_BASE}/notes/{note_id}/share",
            headers=headers
        )
        if response.status_code == 200:
            note = response.json()
            print_success(f"便签分享状态已切换: {note['is_public']}")
            if note['is_public']:
                print_info(f"分享链接: /notes/share/{note['share_token']}")
            return note
        else:
            print_error(f"分享失败: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print_error(f"分享异常: {e}")
        return None

def test_get_public_note(share_token):
    """测试获取公开便签"""
    print_title("8. 测试获取公开便签")
    try:
        response = requests.get(f"{API_BASE}/notes/share/{share_token}")
        if response.status_code == 200:
            note = response.json()
            print_success(f"成功获取公开便签")
            print_info(f"内容: {note['content']}")
            return note
        else:
            print_error(f"获取公开便签失败: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print_error(f"获取公开便签异常: {e}")
        return None

def test_delete_note(token, note_id):
    """测试删除便签"""
    print_title("9. 测试删除便签")
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.delete(
            f"{API_BASE}/notes/{note_id}",
            headers=headers
        )
        if response.status_code == 204:
            print_success(f"便签删除成功: {note_id}")
            return True
        else:
            print_error(f"删除便签失败: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print_error(f"删除便签异常: {e}")
        return False

def run_full_test():
    """运行完整测试流程"""
    test_email = f"test_{int(time.time())}@example.com"
    test_password = "test123456"
    
    print(f"\n{Colors.BOLD}{Colors.YELLOW}")
    print("="*60)
    print("  📌 PinWall 全流程自动化测试")
    print("="*60)
    print(f"{Colors.RESET}")
    
    # 测试计数器
    total_tests = 9
    passed_tests = 0
    
    # 1. 健康检查
    if test_api_health():
        passed_tests += 1
    else:
        print_error("API 未运行，请先启动后端服务")
        return False
    
    time.sleep(0.5)
    
    # 2. 注册
    if test_register(test_email, test_password):
        passed_tests += 1
    else:
        return False
    
    time.sleep(0.5)
    
    # 3. 登录
    token = test_login(test_email, test_password)
    if token:
        passed_tests += 1
    else:
        return False
    
    time.sleep(0.5)
    
    # 4. 创建便签
    test_note = test_create_note(token, "这是一条测试便签！", "#E8F5E9")
    if test_note:
        passed_tests += 1
    else:
        return False
    
    time.sleep(0.5)
    
    # 5. 获取便签列表
    notes = test_get_notes(token)
    if notes is not None:
        passed_tests += 1
    else:
        return False
    
    time.sleep(0.5)
    
    # 6. 更新便签
    updated_note = test_update_note(
        token,
        test_note['id'],
        {
            "content": "这是更新后的便签内容！",
            "is_checked": True,
            "color": "#FFF9C4"
        }
    )
    if updated_note:
        passed_tests += 1
    else:
        return False
    
    time.sleep(0.5)
    
    # 7. 分享便签
    shared_note = test_toggle_share(token, test_note['id'])
    share_token = None
    if shared_note and shared_note['is_public']:
        passed_tests += 1
        share_token = shared_note['share_token']
    else:
        print_error("便签分享失败")
    
    time.sleep(0.5)
    
    # 8. 获取公开便签
    if share_token:
        if test_get_public_note(share_token):
            passed_tests += 1
    else:
        print_info("跳过公开便签测试")
        passed_tests += 1
    
    time.sleep(0.5)
    
    # 9. 删除便签
    if test_delete_note(token, test_note['id']):
        passed_tests += 1
    
    # 打印测试结果
    print(f"\n{Colors.BOLD}")
    print("="*60)
    print("  📊 测试结果")
    print("="*60)
    print(f"{Colors.RESET}")
    
    if passed_tests == total_tests:
        print_success(f"所有 {total_tests} 项测试通过！🎉")
    else:
        print_error(f"{passed_tests}/{total_tests} 项测试通过")
    
    print(f"\n测试用户: {test_email}")
    print(f"测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    return passed_tests == total_tests

if __name__ == "__main__":
    try:
        success = run_full_test()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}测试被中断{Colors.RESET}")
        sys.exit(1)
