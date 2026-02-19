import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { UserProvider } from './contexts/UserContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { Layout } from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
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
import Reviews from './pages/Reviews';
import DocumentReview from './pages/DocumentReview';
import TranslationsFavorites from './pages/TranslationsFavorites';
import Glossary from './pages/Glossary';
import GlossaryManage from './pages/GlossaryManage';
import UserManagement from './pages/UserManagement';
const Activity = () => <div className="p-8"><h1 className="text-2xl font-bold">내 활동</h1></div>;
const Settings = () => <div className="p-8"><h1 className="text-2xl font-bold">설정</h1></div>;

function App() {
  return (
    <ErrorBoundary>
      <UserProvider>
        <SidebarProvider>
          <Router>
            <Routes>
              {/* Public 영역: Layout 없이 렌더링 */}
              <Route path="/" element={
                <ErrorBoundary>
                  <Home />
                </ErrorBoundary>
              } />
              
              {/* App 영역: Layout 포함 */}
              <Route
                path="/*"
                element={
                  <Layout>
                    <ErrorBoundary>
                      <Routes>
                        <Route path="/translate" element={
                          <ErrorBoundary>
                            <Translation />
                          </ErrorBoundary>
                        } />
                        <Route path="/editor" element={
                          <ErrorBoundary>
                            <WebPageEditor />
                          </ErrorBoundary>
                        } />
                        
                        {/* 사이드바 메뉴 라우트 */}
                        <Route path="/dashboard" element={
                          <ErrorBoundary>
                            <Dashboard />
                          </ErrorBoundary>
                        } />
                        <Route path="/translation-guide" element={
                          <ErrorBoundary>
                            <TranslationGuide />
                          </ErrorBoundary>
                        } />
                        <Route path="/translations/pending" element={
                          <ErrorBoundary>
                            <TranslationsPending />
                          </ErrorBoundary>
                        } />
                        <Route path="/translations/:id/work" element={
                          <ErrorBoundary>
                            <TranslationWork />
                          </ErrorBoundary>
                        } />
                        <Route path="/translations/working" element={
                          <ErrorBoundary>
                            <TranslationsWorking />
                          </ErrorBoundary>
                        } />
                        <Route path="/translations/favorites" element={
                          <ErrorBoundary>
                            <TranslationsFavorites />
                          </ErrorBoundary>
                        } />
                        <Route path="/documents" element={
                          <ErrorBoundary>
                            <Documents />
                          </ErrorBoundary>
                        } />
                        <Route path="/translations/new" element={
                          <ErrorBoundary>
                            <NewTranslation />
                          </ErrorBoundary>
                        } />
                        <Route path="/reviews" element={
                          <ErrorBoundary>
                            <Reviews />
                          </ErrorBoundary>
                        } />
                        <Route path="/reviews/:id/review" element={
                          <ErrorBoundary>
                            <DocumentReview />
                          </ErrorBoundary>
                        } />
                        <Route path="/glossary" element={
                          <ErrorBoundary>
                            <Glossary />
                          </ErrorBoundary>
                        } />
                        <Route path="/glossary/manage" element={
                          <ErrorBoundary>
                            <GlossaryManage />
                          </ErrorBoundary>
                        } />
                        <Route path="/users" element={
                          <ErrorBoundary>
                            <UserManagement />
                          </ErrorBoundary>
                        } />
                        <Route path="/activity" element={
                          <ErrorBoundary>
                            <Activity />
                          </ErrorBoundary>
                        } />
                        <Route path="/settings" element={
                          <ErrorBoundary>
                            <Settings />
                          </ErrorBoundary>
                        } />
                      </Routes>
                    </ErrorBoundary>
                  </Layout>
                }
              />
            </Routes>
          </Router>
        </SidebarProvider>
      </UserProvider>
    </ErrorBoundary>
  );
}

export default App;

