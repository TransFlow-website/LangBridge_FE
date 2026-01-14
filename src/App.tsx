import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { UserProvider } from './contexts/UserContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { Layout } from './components/Layout';
import Home from './pages/Home';
import Translation from './pages/Translation';
import WebPageEditor from './pages/WebPageEditor';
import './App.css';

import Dashboard from './pages/Dashboard';
import TranslationGuide from './pages/TranslationGuide';
import NewTranslation from './pages/NewTranslation';
import TranslationsPending from './pages/TranslationsPending';
import Documents from './pages/Documents';
import TranslationWork from './pages/TranslationWork';
import TranslationsWorking from './pages/TranslationsWorking';
const TranslationsFavorites = () => <div className="p-8"><h1 className="text-2xl font-bold">찜한 문서</h1></div>;
const DocumentsCategories = () => <div className="p-8"><h1 className="text-2xl font-bold">카테고리별 문서</h1></div>;
const DocumentsStatus = () => <div className="p-8"><h1 className="text-2xl font-bold">상태별 문서</h1></div>;
const Reviews = () => <div className="p-8"><h1 className="text-2xl font-bold">검토 · 승인</h1></div>;
const Glossary = () => <div className="p-8"><h1 className="text-2xl font-bold">용어집 보기</h1></div>;
const GlossaryManage = () => <div className="p-8"><h1 className="text-2xl font-bold">용어집 관리</h1></div>;
const Activity = () => <div className="p-8"><h1 className="text-2xl font-bold">내 활동</h1></div>;
const Settings = () => <div className="p-8"><h1 className="text-2xl font-bold">설정</h1></div>;

function App() {
  return (
    <UserProvider>
      <SidebarProvider>
        <Router>
          <Routes>
            {/* Public 영역: Layout 없이 렌더링 */}
            <Route path="/" element={<Home />} />
            
            {/* App 영역: Layout 포함 */}
            <Route
              path="/*"
              element={
                <Layout>
                  <Routes>
                    <Route path="/translate" element={<Translation />} />
                    <Route path="/editor" element={<WebPageEditor />} />
                    
                    {/* 사이드바 메뉴 라우트 */}
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/translation-guide" element={<TranslationGuide />} />
                    <Route path="/translations/pending" element={<TranslationsPending />} />
                    <Route path="/translations/:id/work" element={<TranslationWork />} />
                    <Route path="/translations/working" element={<TranslationsWorking />} />
                    <Route path="/translations/favorites" element={<TranslationsFavorites />} />
                    <Route path="/documents" element={<Documents />} />
                    <Route path="/documents/categories" element={<DocumentsCategories />} />
                    <Route path="/documents/status" element={<DocumentsStatus />} />
                    <Route path="/translations/new" element={<NewTranslation />} />
                    <Route path="/reviews" element={<Reviews />} />
                    <Route path="/glossary" element={<Glossary />} />
                    <Route path="/glossary/manage" element={<GlossaryManage />} />
                    <Route path="/activity" element={<Activity />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </Layout>
              }
            />
          </Routes>
        </Router>
      </SidebarProvider>
    </UserProvider>
  );
}

export default App;

