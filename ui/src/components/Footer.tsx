import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

export default function Footer() {
  return (
    <footer className="fixed bottom-0 w-full bg-gray-800 py-4">
      <div className="container mx-auto text-left text-white">
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://github.com/mehmetkirkoca/social-media-manager"
          className="text-white hover:text-blue-500"
        >
          <FontAwesomeIcon icon={['fab', 'github'] as any} className="mr-1" />
          GitHub Repo
        </a>
      </div>
    </footer>
  )
}
