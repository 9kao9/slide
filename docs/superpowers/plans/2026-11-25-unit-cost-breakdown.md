# Unit Cost Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มต้นทุนสินค้า บรรจุภัณฑ์ และขนส่งต่อชิ้นก่อนราคาขาย พร้อมคำนวณกำไรจากต้นทุนรวม

**Architecture:** ขยาย state ของแต่ละชุดด้วย `packagingCost` และ `shippingCost` โดยคง `cost` เดิมไว้เป็นต้นทุนสินค้า ฟังก์ชันคำนวณรับต้นทุนแยกรายการและรวมภายใน ส่วน UI ใช้ slider/input เดิมเพื่อคงรูปแบบและ realtime sync

**Tech Stack:** JavaScript ES modules, Node test runner, HTML/CSS, Supabase realtime state

**Spec:** `docs/superpowers/specs/2026-11-25-unit-cost-breakdown-design.md`

## Global Constraints

- ข้อมูลเดิมที่ไม่มี `packagingCost` และ `shippingCost` ต้องใช้ค่า 0
- ค่า `cost` เดิมต้องกลายเป็นต้นทุนสินค้าโดยไม่ทำให้กำไรเดิมเปลี่ยน
- ทุกช่องพิมพ์และเลื่อนได้เหมือนเดิม
- ไม่เพิ่มภาษีหรือค่าธรรมเนียมเปอร์เซ็นต์

## Review Focus

- ต้นทุนสามรายการต้องถูกรวมครั้งเดียวและหักจากราคาขายก่อนคูณยอดขาย
- ค่าติดลบหรือค่าที่ไม่ใช่ตัวเลขต้องกลายเป็น 0
- ข้อมูลเก่าที่ไม่มีฟิลด์ใหม่ต้องให้ผลคำนวณเดิม
- ข้อมูลใหม่ต้องอยู่ในลิงก์แชร์ ห้อง realtime สำเนาชุด และ local save
- ช่องต้องเรียง ต้นทุนสินค้า → บรรจุภัณฑ์ → ขนส่ง → ราคาขาย → ยอดขาย

---

### Task 1: สูตรต้นทุนรวม

**Files:**
- Modify: `calculator.test.js`
- Modify: `calculator.js`

**Interfaces:**
- Produces: `calculateSummary(price, cost, quantity, packagingCost = 0, shippingCost = 0)`

- [ ] เขียน test ที่ยืนยันว่า 100−40−5−10 คูณ 20 ได้กำไร 900 และ margin 45%
- [ ] รัน test และยืนยันว่า fail เพราะต้นทุนใหม่ยังไม่ถูกหัก
- [ ] เพิ่มการ normalize ต้นทุนใหม่และหักจากกำไร
- [ ] รัน test ทั้งหมดให้ผ่าน

### Task 2: State และข้อมูลเก่า

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `calculateSummary` จาก Task 1
- Produces: group state ที่มี `packagingCost` และ `shippingCost`

- [ ] เพิ่มค่าเริ่มต้น 0 และ sanitize ฟิลด์ใหม่โดยไม่กระทบ `cost` เดิม
- [ ] ส่งต้นทุนใหม่เข้า `calculateSummary`; ให้ระบบ persist/share/realtime ใช้ state เดิมที่ขยายแล้ว
- [ ] ตรวจ syntax และ test suite

### Task 3: ลำดับช่องบนหน้าจอ

**Files:**
- Modify: `app.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: group state จาก Task 2
- Produces: 5 slider/input rows ตามลำดับใน spec

- [ ] เปลี่ยนชื่อ `cost` เป็น “ต้นทุนสินค้า/ชิ้น”
- [ ] เพิ่ม “ค่าบรรจุภัณฑ์/ชิ้น” และ “ค่าขนส่ง/ชิ้น”
- [ ] ย้าย “ราคาขาย/ชิ้น” ไปก่อน “ยอดขายต่อเดือน”
- [ ] bump asset version และทดสอบหน้าเว็บกับข้อมูลเก่า
- [ ] รัน test, syntax check และ `git diff --check`
