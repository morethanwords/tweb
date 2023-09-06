import {InputWebFileLocation} from '../../../../layer';

export default function isWebFileLocation(location: any): location is InputWebFileLocation {
  return location?._.includes('inputWebFile');
}
