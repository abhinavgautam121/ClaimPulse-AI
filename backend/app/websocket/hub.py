import asyncio, json
from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder


class Hub:
    def __init__(self):
        self.clients: dict[WebSocket, asyncio.Queue] = {}

    async def publish(self, kind, details=None):
        payload = {"type": kind, "data": details or {}}
        for client, queue in list(self.clients.items()):
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            queue.put_nowait(payload)

    async def connect(self, ws):
        await ws.accept()
        queue = asyncio.Queue(maxsize=100)
        self.clients[ws] = queue
        return queue

    async def serve(self, ws):
        queue = await self.connect(ws)

        async def send():
            while True:
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=25)
                except asyncio.TimeoutError:
                    payload = {"type": "heartbeat"}
                await ws.send_json(jsonable_encoder(payload))

        async def receive():
            while True:
                await ws.receive_text()

        tasks = [asyncio.create_task(send()), asyncio.create_task(receive())]
        try:
            done, pending = await asyncio.wait(
                tasks, return_when=asyncio.FIRST_COMPLETED
            )
            for t in done:
                t.result()
        finally:
            self.clients.pop(ws, None)
            for t in tasks:
                t.cancel()


hub = Hub()
