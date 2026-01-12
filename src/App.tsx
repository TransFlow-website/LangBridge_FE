import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { UserProvider } from './contexts/UserContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { Layout } from './components/Layout';
import Home from './pages/Home';
import Translation from './pages/Translation';
import WebPageEditor from './pages/WebPageEditor';
import './App.css';

// 더미 페이지 컴포넌트들 (나중에 실제 페이지로 교체)
const Dashboard = () => <div className="p-8"><h1 className="text-2xl font-bold">대시보드</h1></div>;
const TranslationsPending = () => <div className="p-8"><h1 className="text-2xl font-bold">번역 대기 문서</h1></div>;
const TranslationsWorking = () => <div className="p-8"><h1 className="text-2xl font-bold">내가 작업 중인 문서</h1></div>;
const TranslationsFavorites = () => <div className="p-8"><h1 className="text-2xl font-bold">찜한 문서</h1></div>;
const Documents = () => <div className="p-8"><h1 className="text-2xl font-bold">전체 문서</h1></div>;
const DocumentsCategories = () => <div className="p-8"><h1 className="text-2xl font-bold">카테고리별 문서</h1></div>;
const DocumentsStatus = () => <div className="p-8"><h1 className="text-2xl font-bold">상태별 문서</h1></div>;
const NewTranslation = () => <div className="p-8"><h1 className="text-2xl font-bold">새 번역 등록</h1></div>;
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
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/translate" element={<Translation />} />
              <Route path="/editor" element={<WebPageEditor />} />
              
              {/* 사이드바 메뉴 라우트 */}
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/translations/pending" element={<TranslationsPending />} />
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
        </Router>
      </SidebarProvider>
    </UserProvider>
  );
}

export default App;

