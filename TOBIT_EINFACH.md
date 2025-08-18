# 🎯 Tobit: Work Item 594 abrufen - EINFACHE ANLEITUNG

## Problem
Ihr macht bereits SSE-Verbindungen, aber **der Tool-Call fehlt noch**.

## Lösung
Nach der SSE-Verbindung müsst ihr einen **POST-Request** senden:

```http
POST https://azuremcpproxy.onrender.com/message?sessionId=EURE_SESSION_ID
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "get-594",
  "method": "tools/call",
  "params": {
    "name": "get_work_item",
    "arguments": {
      "workItemId": 594
    }
  }
}
```

## Was ihr bereits macht ✅
- SSE-Verbindung zu `/sse` → **funktioniert**
- Hello/Ping Messages → **funktioniert** 
- Session ID bekommen → **funktioniert**

## Was noch fehlt ❌
- Den POST-Request an `/message?sessionId=XXX` → **DAS müsst ihr noch machen!**

## Test-Befehl
```bash
curl -X POST "https://azuremcpproxy.onrender.com/message?sessionId=413cbff2-7575-41ca-9c3f-7dda953c3bd6" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"test","method":"tools/call","params":{"name":"get_work_item","arguments":{"workItemId":594}}}'
```

**Das ist alles! Ein zusätzlicher POST-Request nach der SSE-Verbindung.** 🚀