import { useNavigate } from 'react-router-dom'
import './Home.css'

function Home() {
  const navigate = useNavigate()

  return (
    <div className="home-container">
      <div className="home-content">
        <h1>LangBridge</h1>
        <p className="subtitle">빠르고 정확한 번역 서비스</p>
        
        <div className="features">
          <div className="feature-card">
            <h3>🌍 다국어 지원</h3>
            <p>여러 언어 간 실시간 번역</p>
          </div>
          <div className="feature-card">
            <h3>⚡ 빠른 속도</h3>
            <p>즉시 번역 결과 확인</p>
          </div>
          <div className="feature-card">
            <h3>🎯 높은 정확도</h3>
            <p>자연스러운 번역 품질</p>
          </div>
        </div>

        <button 
          className="start-button"
          onClick={() => navigate('/translate')}
        >
          번역 시작하기
        </button>
      </div>
    </div>
  )
}

export default Home

