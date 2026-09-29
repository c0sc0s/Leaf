import writingCat from '../../illustrations/cat-writing.webp';
import DownloadActions from '../components/DownloadActions.jsx';
import SocialLinks from '../components/SocialLinks.jsx';

export default function Hero() {
  return (
    <section className="hero wrap" aria-labelledby="hero-title">
      <div className="hero-copy">
        <h1 id="hero-title">Leaf</h1>
        <p className="hero-description">
          这是一个 PDF 与 Markdown 阅读器，希望它能帮助你获得阅读的乐趣。
        </p>
        <DownloadActions />
        <SocialLinks />
      </div>
      <figure className="hero-art">
        <img
          src={writingCat}
          draggable={false}
          alt="小猫坐在书堆旁，认真记下阅读时的想法"
          width="1703"
          height="924"
          fetchPriority="high"
        />
      </figure>
    </section>
  );
}
