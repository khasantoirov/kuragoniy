import { Navigate, Route, Routes } from 'react-router-dom'

import { StudentGames } from './StudentGames'
import { StudentHome } from './StudentHome'
import { StudentHomework, StudentHomeworkRun } from './StudentHomework'
import { StudentLessonPage } from './StudentLessonPage'
import { StudentLessons } from './StudentLessons'
import { StudentProfile } from './StudentProfile'
import { StudentResultDetail, StudentResults } from './StudentResults'
import { StudentShell } from './StudentShell'

/** The whole student window (mounted at /s/*) — loaded as one lazy chunk,
 * so staff never download it and students never download staff pages. */
export default function StudentApp() {
  return (
    <Routes>
      <Route element={<StudentShell />}>
        <Route index element={<StudentHome />} />
        <Route path="lessons" element={<StudentLessons />} />
        <Route path="lessons/:id" element={<StudentLessonPage />} />
        <Route path="homework" element={<StudentHomework />} />
        <Route path="homework/:id" element={<StudentHomeworkRun />} />
        <Route path="games" element={<StudentGames />} />
        <Route path="results" element={<StudentResults />} />
        <Route path="results/:id" element={<StudentResultDetail />} />
        <Route path="profile" element={<StudentProfile />} />
        <Route path="*" element={<Navigate to="/s" replace />} />
      </Route>
    </Routes>
  )
}
