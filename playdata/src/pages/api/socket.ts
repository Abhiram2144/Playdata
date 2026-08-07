import type { NextApiRequest, NextApiResponse } from 'next'
import { Server as IOServer } from 'socket.io'

export const config = { api: { bodyParser: false } }

export default function socketHandler(_req: NextApiRequest, res: NextApiResponse) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srv = (res as any).socket?.server
  if (srv && !srv.io) {
    const io = new IOServer(srv, { path: '/api/socket', addTrailingSlash: false })
    srv.io = io
    io.on('connection', (socket) => {
      socket.on('join-session',  (sessionId: string) => socket.join(`session:${sessionId}`))
      socket.on('leave-session', (sessionId: string) => socket.leave(`session:${sessionId}`))
      // Personal room — used to push session:invite events to a specific student.
      socket.on('join-personal',  (studentId: string) => socket.join(`student:${studentId}`))
      socket.on('leave-personal', (studentId: string) => socket.leave(`student:${studentId}`))
    })
  }
  res.end()
}
