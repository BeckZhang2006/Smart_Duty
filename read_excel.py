import pandas as pd
import sys

file_path = r'd:\workspace\zhiban\duty-management-system\miniprogram\电教中心值班规范表（2025-2026-2学期）（1-8周）.xlsx'

# 尝试读取Excel文件，不指定header以便看到原始结构
df = pd.read_excel(file_path, header=None)

print("=== Excel文件内容 ===")
print(df.to_string())
print("\n=== 基本信息 ===")
print(f"形状: {df.shape}")
print(f"列数: {df.shape[1]}")
print(f"行数: {df.shape[0]}")
