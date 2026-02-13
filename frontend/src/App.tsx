import { useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dubbedVideoUrl, setDubbedVideoUrl] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFile(event.target.files[0]);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      alert('Please select a video file.');
      return;
    }

    setLoading(true);
    setError(null);
    setDubbedVideoUrl(null);

    const formData = new FormData();
    formData.append('video', file);
    formData.append('lang', language);

    try {
      const response = await fetch('/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setDubbedVideoUrl(data.dubbedVideoUrl);
    } catch (err) {
      console.error('Error uploading file:', err);
      setError('Failed to dub video. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-5">
      <h1 className="mb-4">Video Dubber</h1>
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label htmlFor="video" className="form-label">
            Upload Video
          </label>
          <input
            type="file"
            className="form-control"
            id="video"
            accept="video/*"
            onChange={handleFileChange}
          />
        </div>
        <div className="mb-3">
          <label htmlFor="language" className="form-label">
            Select Language
          </label>
          <select
            className="form-select"
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="ko">Korean</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Dubbing...' : 'Dub Video'}
        </button>
      </form>

      {error && <div className="alert alert-danger mt-3">{error}</div>}

      {dubbedVideoUrl && (
        <div className="mt-4">
          <h2>Dubbed Video</h2>
          <video controls src={dubbedVideoUrl} style={{ maxWidth: '100%' }}></video>
          <p className="mt-2">
            Download: <a href={dubbedVideoUrl} download>
              {dubbedVideoUrl.split('/').pop()}
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

export default App;
