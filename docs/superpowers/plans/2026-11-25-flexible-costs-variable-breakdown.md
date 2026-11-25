# Flexible Costs and Variable Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มรายการต้นทุนต่อชิ้นที่แก้ไขได้และแถบสัดส่วนอัตโนมัติเทียบกับราคาขาย

**Architecture:** ใช้ `costItems` เป็นแหล่งข้อมูลต้นทุนเดียว พร้อม migration จาก state เดิม ฟังก์ชันคำนวณบริสุทธิ์รวมต้นทุนและสร้าง breakdown; UI render แถวต้นทุนกับแถบอัตโนมัติจาก state เดียวกัน

**Tech Stack:** JavaScript ES modules, Node test runner, HTML/CSS, Supabase realtime state

**Spec:** `docs/superpowers/specs/2026-11-25-flexible-costs-variable-breakdown-design.md`

## Global Constraints

- ข้อมูลเก่าต้องคงค่าต้นทุนทั้งสามรายการ
- ทุกต้นทุนหักจากกำไรและแสดงใน breakdown
- สูงสุด 12 รายการและต้องเหลืออย่างน้อยหนึ่งรายการ
- ส่วนแบ่งอิสระเดิมต้องทำงานเหมือนเดิม

## Review Focus

- ราคาขายเป็นศูนย์ต้องไม่สร้าง `NaN` หรือ `Infinity`
- ต้นทุนรวมเกินราคาขายต้องแสดงขาดทุนโดยไม่ทำให้ layout ล้น
- duplicate และ realtime ต้องไม่แชร์ array reference ระหว่างชุด
- state เก่าที่ไม่มี `costItems` ต้อง migrate เพียงครั้งเดียว
- ชื่อว่างและค่าติดลบต้องถูก sanitize อย่างปลอดภัย

---

### Task 1: Cost calculation and migration helpers

**Files:**
- Modify: `calculator.test.js`
- Modify: `calculator.js`

**Interfaces:**
- Produces: `calculateCostSummary(price, costItems, quantity)`
- Produces: `calculateVariableBreakdown(price, costItems)`

- [x] เขียน tests สำหรับต้นทุนหลายรายการ, ราคา 0 และต้นทุนเกินราคา แล้วรันให้ fail
- [x] เพิ่มฟังก์ชันคำนวณแบบบริสุทธิ์และรัน suite ให้ผ่าน

### Task 2: Flexible cost state and controls

**Files:**
- Modify: `app.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: helpers จาก Task 1
- Produces: `group.costItems` ที่ sanitize และ migrate จาก state เดิม

- [x] เพิ่ม state migration และทดสอบด้วย helper ที่ export ได้
- [x] render ชื่อ/ค่า/range ของ cost items พร้อมเพิ่มและลบรายการ
- [x] ทำ duplicate เป็น deep copy และรักษา undo/save/share/realtime

### Task 3: Variable breakdown and copy changes

**Files:**
- Modify: `app.js`
- Modify: `index.html`
- Modify: `styles.css`

- [x] render แถบ `แบ่งสัดส่วนแปรผันตาม` เหนือแถบอิสระ
- [x] เปลี่ยนข้อความยอดขาย กำไร และหัวข้อแถบอิสระ
- [x] ปรับ responsive styles และ bump asset versions
- [x] รัน tests, syntax checks และ `git diff --check`
